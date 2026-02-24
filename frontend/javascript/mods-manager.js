/**
 * MOD Manager - UI Controller for the MODS navigation section
 * =================================================================
 * List page: InfiniteList cursor + inline toggle + group dividers.
 * Config page: debounce-linked detail view with description, status,
 *              and dynamic config form inputs (select/text/range/toggle/info/action).
 * =================================================================
 */

import { getAllMods, getModsByGroup } from '../mods/mod-loader.js';
import { ModState } from './mod-state.js';
import { InfiniteList } from './blackboard-ui-list.js';
import { BBMessage } from './blackboard-msg.js';
import { playAudio } from './audio.js';
import { t } from './i18n.js';

let infiniteList = null;
let selectionTimer = null;
let selectedModId = null;

const elements = {
    listContainer: document.querySelector('.mods-list-container'),
    refreshBtn: document.getElementById('mods-refresh-btn'),
    configTitle: document.getElementById('mods-config-title'),
    configDescription: document.getElementById('mods-config-description'),
    configStatus: document.getElementById('mods-config-status'),
    configFields: document.getElementById('mods-config-fields'),
    configDefault: document.getElementById('mods-config-default'),
    configRefreshBtn: document.getElementById('mods-config-refresh-btn')
};

// --- Initialise ---
// Called when mods:loaded fires (after mod-loader finishes)
function init() {
    bindEvents();
    renderModList();

    const firstItem = elements.listContainer?.querySelector('.mods-list-item');
    if (firstItem?.dataset?.modId) {
        renderConfig(firstItem.dataset.modId);
    }

    ModState.refreshAllServerStatuses().then(() => {
        updateServerIndicators();
    });
}

// --- List Page: Render ---
function renderModList() {
    const container = elements.listContainer;
    if (!container) return;

    container.innerHTML = '';

    const groups = getModsByGroup();

    for (const [groupName, mods] of Object.entries(groups)) {
        const divider = document.createElement('div');
        divider.className = 'mods-group-divider crt-text-orange';
        divider.textContent = `── ${t('mods.group.' + groupName) || groupName.toUpperCase()} ──`;
        container.appendChild(divider);

        for (const mod of mods) {
            const enabled = ModState.isEnabled(mod.id);
            const serverStatus = ModState.getServerStatus(mod.id);

            const item = document.createElement('div');
            item.className = 'mods-list-item';
            item.dataset.modId = mod.id;

            const info = document.createElement('div');
            info.className = 'mods-list-item-info';

            const nameEl = document.createElement('div');
            nameEl.className = 'mods-list-item-name';
            nameEl.textContent = t(mod.nameKey);

            const meta = document.createElement('div');
            meta.className = 'mods-list-item-meta';

            // Show server status only when active provider is server-type
            const activeProviderId = ModState.getConfig(mod.id, 'provider');
            const activeProvider = mod.providers?.find(p => p.id === activeProviderId);
            if (activeProvider?.type === 'server') {
                const statusEl = document.createElement('span');
                statusEl.className = `mods-server-status ${serverStatus}`;
                statusEl.dataset.modId = mod.id;
                statusEl.textContent = t(`mods.status.${serverStatus}`);
                meta.appendChild(statusEl);
            }

            info.appendChild(nameEl);
            info.appendChild(meta);

            const toggleBtn = document.createElement('button');
            toggleBtn.className = `mods-toggle-btn ${enabled ? 'enabled' : 'disabled'}`;
            toggleBtn.textContent = enabled ? t('mods.enabled') : t('mods.disabled');
            toggleBtn.dataset.modId = mod.id;

            item.appendChild(info);
            item.appendChild(toggleBtn);
            container.appendChild(item);
        }
    }

    if (infiniteList) {
        infiniteList.refresh();
    } else {
        infiniteList = new InfiniteList(container, '.mods-list-item');
    }
}

// --- List Page: Update server status indicators ---
function updateServerIndicators() {
    const indicators = elements.listContainer?.querySelectorAll('.mods-server-status');
    if (!indicators) return;
    indicators.forEach(el => {
        const id = el.dataset.modId;
        const status = ModState.getServerStatus(id);
        el.className = `mods-server-status ${status}`;
        el.textContent = t(`mods.status.${status}`);
    });
    if (selectedModId) renderConfigStatus(selectedModId);
}

// --- Config Page: Render for selected MOD ---
function renderConfig(modId) {
    const mod = getAllMods().find(m => m.id === modId);
    if (!mod) return;

    selectedModId = modId;

    if (elements.configDefault) elements.configDefault.style.display = 'none';

    if (elements.configTitle) {
        elements.configTitle.textContent = t(mod.nameKey);
    }

    if (elements.configDescription) {
        elements.configDescription.textContent = t(mod.descriptionKey);
    }

    renderConfigStatus(modId);
    renderConfigFields(modId);

    // Show refresh button only when active provider is server-type
    const activeProviderId = ModState.getConfig(mod.id, 'provider');
    const activeProvider = mod.providers?.find(p => p.id === activeProviderId);
    if (elements.configRefreshBtn) {
        elements.configRefreshBtn.style.display = activeProvider?.type === 'server' ? '' : 'none';
    }
}

function renderConfigStatus(modId) {
    const mod = getAllMods().find(m => m.id === modId);
    if (!elements.configStatus) return;

    const activeProviderId = ModState.getConfig(modId, 'provider');
    const activeProvider = mod?.providers?.find(p => p.id === activeProviderId);
    if (activeProvider?.type === 'server') {
        const status = ModState.getServerStatus(modId);
        elements.configStatus.innerHTML = '';

        const label = document.createElement('span');
        label.textContent = t('mods.statusLabel');

        const value = document.createElement('span');
        value.className = `mods-server-status ${status}`;
        value.textContent = t(`mods.status.${status}`);

        elements.configStatus.appendChild(label);
        elements.configStatus.appendChild(value);
        elements.configStatus.style.display = '';
    } else {
        elements.configStatus.style.display = 'none';
    }
}

function renderConfigFields(modId) {
    const mod = getAllMods().find(m => m.id === modId);
    if (!elements.configFields) return;

    elements.configFields.innerHTML = '';

    if (!mod?.configSchema || mod.configSchema.length === 0) return;

    for (const field of mod.configSchema) {
        const fieldEl = createConfigField(modId, mod, field);
        if (fieldEl) elements.configFields.appendChild(fieldEl);
    }
}

/**
 * Create a config field element based on field type.
 */
function createConfigField(modId, mod, field) {
    // Check showWhen condition
    if (!evaluateShowWhen(modId, field)) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'mods-config-field';
    wrapper.dataset.configKey = field.key;

    const label = document.createElement('div');
    label.className = 'mods-config-field-label';
    label.textContent = t(field.labelKey) || field.key;
    wrapper.appendChild(label);

    switch (field.type) {
        case 'select':
            wrapper.appendChild(createSelectField(modId, field));
            break;
        case 'text':
            wrapper.appendChild(createTextField(modId, field));
            break;
        case 'range':
            wrapper.appendChild(createRangeField(modId, field));
            break;
        case 'toggle':
            wrapper.appendChild(createToggleField(modId, field));
            break;
        case 'info':
            wrapper.appendChild(createInfoField(modId, mod, field));
            break;
        case 'action':
            wrapper.appendChild(createActionField(modId, mod, field));
            break;
        default:
            wrapper.appendChild(createTextField(modId, field));
    }

    return wrapper;
}

function createSelectField(modId, field) {
    const select = document.createElement('select');
    select.className = 'mods-config-field-select';
    for (const opt of (field.options || [])) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = t(opt.labelKey) || opt.value;
        select.appendChild(option);
    }
    select.value = ModState.getConfig(modId, field.key) ?? field.default ?? '';
    select.addEventListener('change', () => {
        ModState.setConfig(modId, field.key, select.value);
    });
    return select;
}

function createTextField(modId, field) {
    const input = document.createElement('input');
    input.className = 'mods-config-field-input';
    input.type = 'text';
    input.value = ModState.getConfig(modId, field.key) ?? '';
    input.placeholder = field.placeholder || field.default || '';
    input.addEventListener('change', () => {
        ModState.setConfig(modId, field.key, input.value);
    });
    return input;
}

function createRangeField(modId, field) {
    const container = document.createElement('div');
    container.className = 'mods-config-range-group';

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'mods-config-field-range';
    input.min = field.min ?? 0;
    input.max = field.max ?? 100;
    input.step = field.step ?? 1;
    input.value = ModState.getConfig(modId, field.key) ?? field.default ?? input.min;

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'mods-config-range-value crt-text-green';
    valueDisplay.textContent = input.value;

    input.addEventListener('input', () => {
        valueDisplay.textContent = input.value;
    });
    input.addEventListener('change', () => {
        ModState.setConfig(modId, field.key, Number(input.value));
    });

    container.appendChild(input);
    container.appendChild(valueDisplay);
    return container;
}

function createToggleField(modId, field) {
    const btn = document.createElement('button');
    const current = ModState.getConfig(modId, field.key) ?? field.default ?? false;
    btn.className = `mods-toggle-btn ${current ? 'enabled' : 'disabled'}`;
    btn.textContent = current ? t('mods.enabled') : t('mods.disabled');
    btn.addEventListener('click', () => {
        const newVal = !ModState.getConfig(modId, field.key);
        ModState.setConfig(modId, field.key, newVal);
        btn.className = `mods-toggle-btn ${newVal ? 'enabled' : 'disabled'}`;
        btn.textContent = newVal ? t('mods.enabled') : t('mods.disabled');
    });
    return btn;
}

function createInfoField(modId, mod, field) {
    const span = document.createElement('span');
    span.className = 'mods-config-field-info crt-text-green';
    // If the MOD provides a getInfoValue method, use it
    if (typeof mod.getInfoValue === 'function') {
        span.textContent = mod.getInfoValue(field.key);
    } else {
        span.textContent = ModState.getConfig(modId, field.key) ?? '—';
    }
    return span;
}

function createActionField(modId, mod, field) {
    const btn = document.createElement('button');
    btn.className = 'mods-config-field-action crt-text-green';
    btn.textContent = t(field.actionLabelKey) || field.key;
    btn.addEventListener('click', async () => {
        if (typeof mod.onAction === 'function') {
            btn.disabled = true;
            try {
                await mod.onAction(field.key);
            } finally {
                btn.disabled = false;
            }
        }
    });
    return btn;
}

/**
 * Evaluate showWhen condition for a config field.
 */
function evaluateShowWhen(modId, field) {
    if (!field.showWhen) return true;
    const currentValue = ModState.getConfig(modId, field.showWhen.key);
    return currentValue === field.showWhen.value;
}

// --- Events ---
function bindEvents() {
    // Toggle button delegation on list
    elements.listContainer?.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.mods-toggle-btn');
        if (!toggleBtn) return;

        e.stopPropagation();

        const modId = toggleBtn.dataset.modId;
        const mod = getAllMods().find(m => m.id === modId);
        if (!mod) return;

        const currentlyEnabled = ModState.isEnabled(modId);

        if (!currentlyEnabled) {
            const hasServer = mod.providers?.some(p => p.type === 'server');
            if (hasServer) {
                const status = ModState.getServerStatus(modId);
                if (status === 'offline') {
                    BBMessage.error(t('mods.serverOfflineWarning'));
                }
            }
        }

        const newState = !currentlyEnabled;
        ModState.setEnabled(modId, newState);

        playAudio(newState ? 'UISelectOn.mp3' : 'UISelectOff.mp3');

        toggleBtn.className = `mods-toggle-btn ${newState ? 'enabled' : 'disabled'}`;
        toggleBtn.textContent = newState ? t('mods.enabled') : t('mods.disabled');
    });

    // InfiniteList selection → debounce → dispatch mods:selected
    window.addEventListener('list:selectionChanged', ({ detail }) => {
        if (!elements.listContainer?.contains(detail.item)) return;

        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(() => {
            const modId = detail.item?.dataset?.modId;
            if (modId) {
                window.dispatchEvent(new CustomEvent('mods:selected', { detail: { modId } }));
            }
        }, 500);
    });

    // Config page responds to selection
    window.addEventListener('mods:selected', ({ detail }) => {
        renderConfig(detail.modId);
    });

    // Refresh button on list page
    elements.refreshBtn?.addEventListener('click', async () => {
        playAudio('UIGeneralFocus.mp3');
        const msg = BBMessage.info(t('mods.refreshing'));

        await ModState.refreshAllServerStatuses();
        updateServerIndicators();

        msg.update(t('mods.refreshComplete'));
    });

    // When navigating to config page, ensure selected MOD is rendered
    window.addEventListener('navi:pageChanged', ({ detail }) => {
        if (detail.page === 'mods-config' && selectedModId) {
            renderConfig(selectedModId);
        }
    });

    // Re-render config fields when config changes (for showWhen re-evaluation)
    // Also re-render list + config status when provider changes
    window.addEventListener('mods:configChanged', ({ detail }) => {
        if (detail.key === 'provider') {
            renderModList();
        }
        if (detail.modId === selectedModId) {
            renderConfigFields(selectedModId);
            renderConfigStatus(selectedModId);
        }
    });

    // Refresh button on config page
    elements.configRefreshBtn?.addEventListener('click', async () => {
        if (!selectedModId) return;
        playAudio('UIGeneralFocus.mp3');

        await ModState.refreshServerStatus(selectedModId);
        renderConfigStatus(selectedModId);
        updateServerIndicators();
    });
}

// Wait for mods to be loaded before initialising
window.addEventListener('mods:loaded', () => {
    init();
});
