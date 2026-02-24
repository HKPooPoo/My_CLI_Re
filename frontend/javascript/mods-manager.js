/**
 * MOD Manager - UI Controller for the MODS navigation section
 * =================================================================
 * List page: InfiniteList cursor + inline toggle + group dividers.
 * Config page: debounce-linked detail view with description, status,
 *              and dynamic config form inputs.
 * =================================================================
 */

import { MOD_REGISTRY, MOD_TYPES } from './mod-registry.js';
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
function init() {
    ModState.init();
    renderModList();
    bindEvents();

    // Background refresh server statuses
    ModState.refreshAllServerStatuses().then(() => {
        updateServerIndicators();
    });
}

// --- List Page: Render ---
function renderModList() {
    const container = elements.listContainer;
    if (!container) return;

    container.innerHTML = '';

    // Group MODs by their group field
    const groups = {};
    for (const [id, def] of Object.entries(MOD_REGISTRY)) {
        const group = def.group || 'other';
        if (!groups[group]) groups[group] = [];
        groups[group].push([id, def]);
    }

    for (const [groupName, mods] of Object.entries(groups)) {
        // Group divider
        const divider = document.createElement('div');
        divider.className = 'mods-group-divider crt-text-orange';
        divider.textContent = `── ${t('mods.group.' + groupName) || groupName.toUpperCase()} ──`;
        container.appendChild(divider);

        for (const [id, def] of mods) {
            const enabled = ModState.isEnabled(id);
            const serverStatus = ModState.getServerStatus(id);

            const item = document.createElement('div');
            item.className = 'mods-list-item';
            item.dataset.modId = id;

            // Left: info column
            const info = document.createElement('div');
            info.className = 'mods-list-item-info';

            const nameEl = document.createElement('div');
            nameEl.className = 'mods-list-item-name';
            nameEl.textContent = t(def.nameKey);

            const meta = document.createElement('div');
            meta.className = 'mods-list-item-meta';

            const typeEl = document.createElement('span');
            typeEl.textContent = def.type.toUpperCase();
            meta.appendChild(typeEl);

            if (def.type === MOD_TYPES.SERVER) {
                const statusEl = document.createElement('span');
                statusEl.className = `mods-server-status ${serverStatus}`;
                statusEl.dataset.modId = id;
                statusEl.textContent = t(`mods.status.${serverStatus}`);
                meta.appendChild(statusEl);
            }

            info.appendChild(nameEl);
            info.appendChild(meta);

            // Right: toggle button
            const toggleBtn = document.createElement('button');
            toggleBtn.className = `mods-toggle-btn ${enabled ? 'enabled' : 'disabled'}`;
            toggleBtn.textContent = enabled ? t('mods.enabled') : t('mods.disabled');
            toggleBtn.dataset.modId = id;

            item.appendChild(info);
            item.appendChild(toggleBtn);
            container.appendChild(item);
        }
    }

    // Init or refresh InfiniteList
    if (infiniteList) {
        infiniteList.refresh();
    } else {
        infiniteList = new InfiniteList(container, '.mods-list-item');
    }
}

// --- List Page: Update server status indicators without full re-render ---
function updateServerIndicators() {
    const indicators = elements.listContainer?.querySelectorAll('.mods-server-status');
    if (!indicators) return;
    indicators.forEach(el => {
        const id = el.dataset.modId;
        const status = ModState.getServerStatus(id);
        el.className = `mods-server-status ${status}`;
        el.textContent = t(`mods.status.${status}`);
    });
    // Also update config page if viewing a SERVER MOD
    if (selectedModId) renderConfigStatus(selectedModId);
}

// --- Config Page: Render for selected MOD ---
function renderConfig(modId) {
    const def = MOD_REGISTRY[modId];
    if (!def) return;

    selectedModId = modId;

    // Hide default text, show content
    if (elements.configDefault) elements.configDefault.style.display = 'none';

    // Title
    if (elements.configTitle) {
        elements.configTitle.textContent = t(def.nameKey);
    }

    // Description
    if (elements.configDescription) {
        elements.configDescription.textContent = t(def.descriptionKey);
    }

    // Server status
    renderConfigStatus(modId);

    // Config fields
    renderConfigFields(modId);

    // Show/hide refresh button for SERVER MODs
    if (elements.configRefreshBtn) {
        elements.configRefreshBtn.style.display = (def.type === MOD_TYPES.SERVER) ? '' : 'none';
    }
}

function renderConfigStatus(modId) {
    const def = MOD_REGISTRY[modId];
    if (!elements.configStatus) return;

    if (def?.type === MOD_TYPES.SERVER) {
        const status = ModState.getServerStatus(modId);
        elements.configStatus.innerHTML = '';

        const label = document.createElement('span');
        label.textContent = 'STATUS';

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
    const def = MOD_REGISTRY[modId];
    if (!elements.configFields) return;

    elements.configFields.innerHTML = '';

    if (!def?.config || def.config.length === 0) return;

    for (const field of def.config) {
        const fieldEl = document.createElement('div');
        fieldEl.className = 'mods-config-field';

        const label = document.createElement('div');
        label.className = 'mods-config-field-label';
        label.textContent = t(field.labelKey) || field.key;

        const input = document.createElement('input');
        input.className = 'mods-config-field-input';
        input.type = field.type || 'text';
        input.value = ModState.getConfig(modId, field.key) || '';
        input.placeholder = field.default || '';
        input.dataset.modId = modId;
        input.dataset.configKey = field.key;

        input.addEventListener('change', () => {
            ModState.setConfig(modId, field.key, input.value);
        });

        fieldEl.appendChild(label);
        fieldEl.appendChild(input);
        elements.configFields.appendChild(fieldEl);
    }
}

// --- Events ---
function bindEvents() {
    // Toggle button delegation on list
    elements.listContainer?.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.mods-toggle-btn');
        if (!toggleBtn) return;

        e.stopPropagation(); // Don't trigger InfiniteList click

        const modId = toggleBtn.dataset.modId;
        const def = MOD_REGISTRY[modId];
        if (!def) return;

        const currentlyEnabled = ModState.isEnabled(modId);

        // Warn if enabling a SERVER MOD that is offline
        if (!currentlyEnabled && def.type === MOD_TYPES.SERVER) {
            const status = ModState.getServerStatus(modId);
            if (status === 'offline') {
                BBMessage.error(t('mods.serverOfflineWarning'));
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
        // Only handle events from the mods list container
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

    // Refresh button on config page
    elements.configRefreshBtn?.addEventListener('click', async () => {
        if (!selectedModId) return;
        playAudio('UIGeneralFocus.mp3');

        await ModState.refreshServerStatus(selectedModId);
        renderConfigStatus(selectedModId);
        updateServerIndicators();
    });
}

init();
