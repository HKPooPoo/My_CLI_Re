/**
 * MOD Manager - Instance-Based UI Controller
 * =================================================================
 * List page: Two-container layout — template catalog + active instances
 *            + instance actions (UP/DOWN/DELETE) below the list.
 * Config page: Instance config fields only.
 * =================================================================
 */

import { getAllTemplates, getTemplate, getInstances, getInstancesByTemplate,
         rebuildInstanceButtons, removeInstanceButton, updateInstanceButton } from '../mods/mod-loader.js';
import { ModState } from './mod-state.js';
import { InfiniteList } from './blackboard-ui-list.js';
import { BBMessage } from './blackboard-msg.js';
import { playAudio } from './audio.js';
import { t } from './i18n.js';
import { registerFieldType, getRenderer } from './mod-field-registry.js';

let infiniteList = null;
let selectionTimer = null;
let selectedInstanceId = null;
let _selectAbort = null;  // AbortController for custom select close-handlers

const elements = {
    listContainer: document.querySelector('.mods-list-container'),
    actionsContainer: document.getElementById('mods-instance-actions'),
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
    // Register built-in config field type renderers
    registerFieldType('select',      createSelectField);
    registerFieldType('text',        createTextField);
    registerFieldType('textarea',    createTextareaField);
    registerFieldType('range',       createRangeField);
    registerFieldType('toggle',      createToggleField);
    registerFieldType('icon-picker', createIconPickerField);
    registerFieldType('info',        createInfoField);
    registerFieldType('action',      createActionField);

    bindEvents();

    // Select first instance and pass to renderListPage so InfiniteList
    // finds the .active class without dispatching a redundant event.
    const instances = ModState.getInstances();
    if (instances.length > 0) {
        selectedInstanceId = instances[0].instanceId;
        renderListPage(selectedInstanceId);
        renderConfig(selectedInstanceId);
        renderInstanceActions(selectedInstanceId);
    } else {
        renderListPage();
    }

    ModState.refreshAllServerStatuses().then(() => {
        updateServerIndicators();
    });
}

// ===================== List Page =====================

function renderListPage(activeInstanceId) {
    const container = elements.listContainer;
    if (!container) return;
    container.innerHTML = '';

    renderTemplateCatalog(container);
    renderActiveInstances(container);

    // Mark selected item BEFORE refresh so InfiniteList finds it via .active class
    if (activeInstanceId) {
        const target = container.querySelector(`.mods-list-item[data-instance-id="${activeInstanceId}"]`);
        if (target) target.classList.add('active');
    }

    if (infiniteList) {
        infiniteList.refresh();
    } else {
        infiniteList = new InfiniteList(container, '.mods-list-item');
    }
}

/**
 * Render the "AVAILABLE MODS" template catalog section.
 */
function renderTemplateCatalog(container) {
    const divider = document.createElement('div');
    divider.className = 'mods-group-divider crt-text-orange';
    divider.textContent = `\u2500\u2500 ${t('mods.catalog')} \u2500\u2500`;
    container.appendChild(divider);

    const templates = getAllTemplates();
    for (const tpl of templates) {
        const instances = ModState.getInstancesByTemplate(tpl.id);
        const maxInst = tpl.maxInstances || 0;
        const atLimit = maxInst > 0 && instances.length >= maxInst;

        const item = document.createElement('div');
        item.className = 'mods-catalog-item';
        item.dataset.templateId = tpl.id;

        const nameEl = document.createElement('div');
        nameEl.className = 'mods-catalog-item-name';
        nameEl.textContent = t(tpl.nameKey);

        item.appendChild(nameEl);

        if (atLimit) {
            const addedLabel = document.createElement('span');
            addedLabel.className = 'mods-catalog-added crt-text-green';
            addedLabel.textContent = t('mods.maxReached');
            item.appendChild(addedLabel);
        } else {
            const addBtn = document.createElement('button');
            addBtn.className = 'mods-catalog-add-btn crt-text-green';
            addBtn.textContent = t('mods.addBtn');
            addBtn.dataset.templateId = tpl.id;
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleAddInstance(tpl.id);
            });
            item.appendChild(addBtn);
        }

        container.appendChild(item);
    }
}

/**
 * Render the "ACTIVE MODS" instances section (InfiniteList items).
 */
function renderActiveInstances(container) {
    const divider = document.createElement('div');
    divider.className = 'mods-group-divider crt-text-orange';
    divider.textContent = `\u2500\u2500 ${t('mods.active')} \u2500\u2500`;
    container.appendChild(divider);

    const instances = ModState.getInstances(); // ordered

    for (const inst of instances) {
        const template = getTemplate(inst.templateId);
        if (!template) continue;

        const serverStatus = ModState.getServerStatus(inst.instanceId);

        const item = document.createElement('div');
        item.className = 'mods-list-item';
        item.dataset.instanceId = inst.instanceId;

        const info = document.createElement('div');
        info.className = 'mods-list-item-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'mods-list-item-name';
        nameEl.textContent = typeof template.getInstanceName === 'function'
            ? template.getInstanceName(inst.config, t)
            : t(template.nameKey);

        if (template.version) {
            const versionEl = document.createElement('span');
            versionEl.className = 'mods-list-item-version crt-text-green';
            versionEl.textContent = `v${template.version}`;
            nameEl.appendChild(versionEl);
        }

        const meta = document.createElement('div');
        meta.className = 'mods-list-item-meta';

        // Show server status only when active provider is server-type
        const activeProviderId = inst.config?.provider;
        const activeProvider = template.providers?.find(p => p.id === activeProviderId);
        if (activeProvider?.type === 'server') {
            const statusEl = document.createElement('span');
            statusEl.className = `mods-server-status ${serverStatus}`;
            statusEl.dataset.instanceId = inst.instanceId;
            statusEl.textContent = t(`mods.status.${serverStatus}`);
            meta.appendChild(statusEl);
        }

        info.appendChild(nameEl);
        info.appendChild(meta);

        item.appendChild(info);
        container.appendChild(item);
    }
}

function handleAddInstance(templateId) {
    playAudio('UISelectOn.mp3');
    const instance = ModState.addInstance(templateId);
    if (!instance) {
        BBMessage.error(t('mods.maxReached'));
        return;
    }
    rebuildInstanceButtons();
    selectedInstanceId = instance.instanceId;
    renderListPage(selectedInstanceId);
    renderConfig(selectedInstanceId);
    renderInstanceActions(selectedInstanceId);
}

// ===================== Instance Actions (List Page) =====================

/**
 * Render UP/DOWN/DELETE actions below the list, for the selected instance.
 */
function renderInstanceActions(instanceId) {
    const container = elements.actionsContainer;
    if (!container) return;
    container.innerHTML = '';

    if (!instanceId) return;

    const inst = ModState.getInstance(instanceId);
    if (!inst) return;

    const template = getTemplate(inst.templateId);
    const instances = ModState.getInstances();
    const idx = instances.findIndex(i => i.instanceId === instanceId);

    // MOVE UP
    const upBtn = document.createElement('button');
    upBtn.className = 'mods-action-btn crt-text-green';
    upBtn.textContent = '\u25B2 ' + t('mods.moveUp');
    upBtn.disabled = idx <= 0;
    upBtn.addEventListener('click', () => {
        playAudio('UIGeneralFocus.mp3');
        ModState.reorderInstance(instanceId, -1);
        rebuildInstanceButtons();
        renderListPage(instanceId);
        renderInstanceActions(instanceId);
    });

    // MOVE DOWN
    const downBtn = document.createElement('button');
    downBtn.className = 'mods-action-btn crt-text-green';
    downBtn.textContent = '\u25BC ' + t('mods.moveDown');
    downBtn.disabled = idx >= instances.length - 1;
    downBtn.addEventListener('click', () => {
        playAudio('UIGeneralFocus.mp3');
        ModState.reorderInstance(instanceId, 1);
        rebuildInstanceButtons();
        renderListPage(instanceId);
        renderInstanceActions(instanceId);
    });

    container.appendChild(upBtn);
    container.appendChild(downBtn);

    // DELETE — any instance can be deleted (ADD/DELETE model)
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'mods-action-btn mods-action-delete crt-text-red';
    deleteBtn.textContent = t('mods.deleteInstance');
    deleteBtn.addEventListener('click', () => {
        playAudio('UIGeneralCancel.mp3');
        removeInstanceButton(instanceId);
        ModState.removeInstance(instanceId);

        // Select another instance or clear
        const remaining = ModState.getInstances();
        if (remaining.length > 0) {
            selectedInstanceId = remaining[0].instanceId;
            renderListPage(selectedInstanceId);
            renderConfig(selectedInstanceId);
            renderInstanceActions(selectedInstanceId);
        } else {
            selectedInstanceId = null;
            renderListPage();
            renderInstanceActions(null);
            if (elements.configDefault) elements.configDefault.style.display = '';
            if (elements.configTitle) elements.configTitle.textContent = '\u2014';
            if (elements.configDescription) elements.configDescription.textContent = '';
            if (elements.configFields) elements.configFields.innerHTML = '';
            if (elements.configStatus) elements.configStatus.style.display = 'none';
        }
    });

    container.appendChild(deleteBtn);
}

// --- Update server status indicators ---
function updateServerIndicators() {
    const indicators = elements.listContainer?.querySelectorAll('.mods-server-status');
    if (!indicators) return;
    indicators.forEach(el => {
        const id = el.dataset.instanceId;
        if (!id) return;
        const status = ModState.getServerStatus(id);
        el.className = `mods-server-status ${status}`;
        el.textContent = t(`mods.status.${status}`);
    });
    if (selectedInstanceId) renderConfigStatus(selectedInstanceId);
}

// ===================== Config Page =====================

function renderConfig(instanceId) {
    const inst = ModState.getInstance(instanceId);
    if (!inst) return;

    const template = getTemplate(inst.templateId);
    if (!template) return;

    selectedInstanceId = instanceId;

    if (elements.configDefault) elements.configDefault.style.display = 'none';

    if (elements.configTitle) {
        elements.configTitle.textContent = typeof template.getInstanceName === 'function'
            ? template.getInstanceName(inst.config, t)
            : t(template.nameKey);
    }

    if (elements.configDescription) {
        elements.configDescription.textContent = t(template.descriptionKey);
    }

    renderConfigStatus(instanceId);
    renderConfigFields(instanceId);

    // Show refresh button only when active provider is server-type
    const activeProviderId = inst.config?.provider;
    const activeProvider = template.providers?.find(p => p.id === activeProviderId);
    if (elements.configRefreshBtn) {
        elements.configRefreshBtn.style.display = activeProvider?.type === 'server' ? '' : 'none';
    }
}

function renderConfigStatus(instanceId) {
    const inst = ModState.getInstance(instanceId);
    if (!elements.configStatus || !inst) return;

    const template = getTemplate(inst.templateId);
    const activeProviderId = inst.config?.provider;
    const activeProvider = template?.providers?.find(p => p.id === activeProviderId);

    if (activeProvider?.type === 'server') {
        const status = ModState.getServerStatus(instanceId);
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

function renderConfigFields(instanceId) {
    const inst = ModState.getInstance(instanceId);
    if (!elements.configFields || !inst) return;

    // Abort previous select close-handlers to prevent leaks
    if (_selectAbort) _selectAbort.abort();
    _selectAbort = new AbortController();

    const template = getTemplate(inst.templateId);
    elements.configFields.innerHTML = '';

    if (template?.configSchema && template.configSchema.length > 0) {
        for (const field of template.configSchema) {
            const fieldEl = createConfigField(instanceId, template, field);
            if (fieldEl) elements.configFields.appendChild(fieldEl);
        }
    }
}

// ===================== Config Field Creators =====================

function createConfigField(instanceId, template, field) {
    if (!evaluateShowWhen(instanceId, field)) return null;

    const isStacked = field.type === 'textarea' || field.type === 'icon-picker';

    const wrapper = document.createElement('div');
    wrapper.className = isStacked ? 'mods-config-field mods-config-field-stacked' : 'mods-config-field';
    wrapper.dataset.configKey = field.key;

    const label = document.createElement('div');
    label.className = 'mods-config-field-label';
    label.textContent = t(field.labelKey) || field.key;
    wrapper.appendChild(label);

    const renderer = getRenderer(field.type);
    if (renderer) {
        wrapper.appendChild(renderer(instanceId, template, field));
    }

    return wrapper;
}

function createSelectField(instanceId, template, field) {
    const currentValue = ModState.getConfig(instanceId, field.key) ?? field.default ?? '';
    const options = field.options || [];
    const currentOpt = options.find(o => o.value === currentValue);

    // Container
    const container = document.createElement('div');
    container.className = 'mods-select';

    // Display button (shows current selection)
    const display = document.createElement('button');
    display.className = 'mods-select-display';
    display.textContent = currentOpt ? (t(currentOpt.labelKey) || currentOpt.value) : currentValue;

    // Dropdown panel
    const dropdown = document.createElement('div');
    dropdown.className = 'mods-select-dropdown mod-scrollbar';

    for (const opt of options) {
        const item = document.createElement('div');
        item.className = 'mods-select-option';
        if (opt.value === currentValue) item.classList.add('selected');
        item.dataset.value = opt.value;
        item.textContent = t(opt.labelKey) || opt.value;

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            // Update state
            ModState.setConfig(instanceId, field.key, opt.value);
            // Update display
            display.textContent = t(opt.labelKey) || opt.value;
            // Update selected class
            dropdown.querySelectorAll('.mods-select-option').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            // Close
            container.classList.remove('open');
        });

        dropdown.appendChild(item);
    }

    // Toggle open/close
    display.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close any other open selects first
        document.querySelectorAll('.mods-select.open').forEach(el => {
            if (el !== container) el.classList.remove('open');
        });
        container.classList.toggle('open');
    });

    // Close on outside click (cleaned up via AbortController on re-render)
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            container.classList.remove('open');
        }
    }, { signal: _selectAbort?.signal });

    container.appendChild(display);
    container.appendChild(dropdown);
    return container;
}

function createTextField(instanceId, template, field) {
    const input = document.createElement('input');
    input.className = 'mods-config-field-input';
    input.type = 'text';
    input.value = ModState.getConfig(instanceId, field.key) ?? '';
    input.placeholder = field.placeholder || field.default || '';
    input.addEventListener('change', () => {
        ModState.setConfig(instanceId, field.key, input.value);
    });
    return input;
}

function createTextareaField(instanceId, template, field) {
    const container = document.createElement('div');
    container.className = 'mods-textarea-field';

    const textarea = document.createElement('textarea');
    textarea.className = 'mods-config-field-textarea mod-scrollbar';
    textarea.rows = field.rows || 3;
    textarea.value = ModState.getConfig(instanceId, field.key) ?? field.default ?? '';
    textarea.placeholder = field.placeholder || '';
    textarea.addEventListener('change', () => {
        ModState.setConfig(instanceId, field.key, textarea.value);
    });

    container.appendChild(textarea);

    // Optional preset chips
    if (Array.isArray(field.presets) && field.presets.length > 0) {
        const presetContainer = document.createElement('div');
        presetContainer.className = 'mods-textarea-presets mod-scrollbar-x';

        for (const preset of field.presets) {
            const chip = document.createElement('button');
            chip.className = 'mods-textarea-preset';
            chip.textContent = t(preset.labelKey) || preset.value;
            chip.addEventListener('click', () => {
                textarea.value = preset.value;
                textarea.dispatchEvent(new Event('change'));
            });
            presetContainer.appendChild(chip);
        }

        container.appendChild(presetContainer);
    }

    return container;
}

function createIconPickerField(instanceId, template, field) {
    const currentValue = ModState.getConfig(instanceId, field.key) ?? field.default ?? '';
    const icons = field.icons || [];

    const grid = document.createElement('div');
    grid.className = 'mods-icon-picker-grid mod-scrollbar-x';

    for (const icon of icons) {
        const btn = document.createElement('button');
        btn.className = 'mods-icon-picker-item';
        if (icon.value === currentValue) btn.classList.add('selected');
        btn.dataset.value = icon.value;
        btn.title = t(icon.labelKey) || icon.value;
        btn.style.setProperty('--picker-icon', `url('${icon.url}')`);

        btn.addEventListener('click', () => {
            grid.querySelectorAll('.mods-icon-picker-item').forEach(el => el.classList.remove('selected'));
            btn.classList.add('selected');
            ModState.setConfig(instanceId, field.key, icon.value);
        });

        grid.appendChild(btn);
    }

    return grid;
}

function createRangeField(instanceId, template, field) {
    const container = document.createElement('div');
    container.className = 'mods-config-range-group';

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'mods-config-field-range';
    input.min = field.min ?? 0;
    input.max = field.max ?? 100;
    input.step = field.step ?? 1;
    input.value = ModState.getConfig(instanceId, field.key) ?? field.default ?? input.min;

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'mods-config-range-value crt-text-green';
    valueDisplay.textContent = input.value;

    input.addEventListener('input', () => {
        valueDisplay.textContent = input.value;
    });
    input.addEventListener('change', () => {
        ModState.setConfig(instanceId, field.key, Number(input.value));
    });

    container.appendChild(input);
    container.appendChild(valueDisplay);
    return container;
}

function createToggleField(instanceId, template, field) {
    const btn = document.createElement('button');
    const current = ModState.getConfig(instanceId, field.key) ?? field.default ?? false;
    btn.className = `mods-toggle-btn ${current ? 'enabled' : 'disabled'}`;
    btn.textContent = current ? t('mods.enabled') : t('mods.disabled');
    btn.addEventListener('click', () => {
        const newVal = !ModState.getConfig(instanceId, field.key);
        ModState.setConfig(instanceId, field.key, newVal);
        btn.className = `mods-toggle-btn ${newVal ? 'enabled' : 'disabled'}`;
        btn.textContent = newVal ? t('mods.enabled') : t('mods.disabled');
    });
    return btn;
}

function createInfoField(instanceId, template, field) {
    const span = document.createElement('span');
    span.className = 'mods-config-field-info crt-text-green';
    if (typeof template.getInfoValue === 'function') {
        span.textContent = template.getInfoValue(field.key, instanceId);
    } else {
        span.textContent = ModState.getConfig(instanceId, field.key) ?? '\u2014';
    }
    return span;
}

function createActionField(instanceId, template, field) {
    const btn = document.createElement('button');
    btn.className = 'mods-config-field-action crt-text-green';
    btn.textContent = t(field.actionLabelKey) || field.key;
    btn.addEventListener('click', async () => {
        if (typeof template.onAction === 'function') {
            btn.disabled = true;
            try {
                await template.onAction(field.key, instanceId);
            } finally {
                btn.disabled = false;
            }
        }
    });
    return btn;
}

function evaluateShowWhen(instanceId, field) {
    if (!field.showWhen) return true;
    let currentValue = ModState.getConfig(instanceId, field.showWhen.key);
    // Resolve default from configSchema when config key hasn't been set
    if (currentValue === null) {
        const inst = ModState.getInstance(instanceId);
        if (inst) {
            const tmpl = getTemplate(inst.templateId);
            const ref = tmpl?.configSchema?.find(f => f.key === field.showWhen.key);
            if (ref && ref.default !== undefined) currentValue = ref.default;
        }
    }
    return currentValue === field.showWhen.value;
}

// ===================== Events =====================

function bindEvents() {
    // InfiniteList selection → set ID immediately, debounce rendering
    window.addEventListener('list:selectionChanged', ({ detail }) => {
        if (!elements.listContainer?.contains(detail.item)) return;

        // Set selectedInstanceId immediately so navi:pageChanged → renderConfig
        // always uses the latest selection (no stale ID during debounce window).
        const instanceId = detail.item?.dataset?.instanceId;
        if (instanceId) selectedInstanceId = instanceId;

        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(() => {
            if (instanceId) {
                renderInstanceActions(instanceId);
                window.dispatchEvent(new CustomEvent('mods:selected', { detail: { instanceId } }));
            }
        }, 500);
    });

    // Config page responds to selection
    window.addEventListener('mods:selected', ({ detail }) => {
        renderConfig(detail.instanceId);
    });

    // Refresh button on list page
    elements.refreshBtn?.addEventListener('click', async () => {
        playAudio('UIGeneralFocus.mp3');
        const msg = BBMessage.loading(t('mods.refreshing'));

        await ModState.refreshAllServerStatuses();
        updateServerIndicators();

        msg.update(t('mods.refreshComplete'));
    });

    // When navigating to config page, ensure selected instance is rendered
    window.addEventListener('navi:pageChanged', ({ detail }) => {
        if (detail.page === 'mods-config' && selectedInstanceId) {
            renderConfig(selectedInstanceId);
        }
    });

    // Re-render config fields when config changes (for showWhen + button icon update)
    window.addEventListener('mods:configChanged', ({ detail }) => {
        if (detail.instanceId) {
            updateInstanceButton(detail.instanceId);
        }

        if (detail.instanceId === selectedInstanceId) {
            renderConfigFields(selectedInstanceId);
            renderConfigStatus(selectedInstanceId);

            // Update title (instance name may change with config)
            const inst = ModState.getInstance(selectedInstanceId);
            const template = inst ? getTemplate(inst.templateId) : null;
            if (template && elements.configTitle) {
                elements.configTitle.textContent = typeof template.getInstanceName === 'function'
                    ? template.getInstanceName(inst.config, t)
                    : t(template.nameKey);
            }
        }

        // Re-render list once (covers provider change + name display update)
        renderListPage(selectedInstanceId);
        renderInstanceActions(selectedInstanceId);
    });

    // Refresh button on config page
    elements.configRefreshBtn?.addEventListener('click', async () => {
        if (!selectedInstanceId) return;
        playAudio('UIGeneralFocus.mp3');

        await ModState.refreshServerStatus(selectedInstanceId);
        renderConfigStatus(selectedInstanceId);
        updateServerIndicators();
    });
}

// Wait for mods to be loaded before initialising
window.addEventListener('mods:loaded', () => {
    init();
});
