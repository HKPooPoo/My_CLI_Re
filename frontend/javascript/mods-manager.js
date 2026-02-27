/**
 * MOD Manager - Instance-Based UI Controller
 * =================================================================
 * List page: Two-container layout — template catalog + active instances
 *            + instance actions (UP/DOWN/DELETE) below the list.
 * Config page: Two-section layout — shared group config + instance config.
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
let selectedTemplateId = null;
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

// ===================== Accessor Factories =====================

function makeInstanceAccessor(instanceId) {
    return {
        get: (key) => ModState.getConfig(instanceId, key),
        set: (key, val) => ModState.setConfig(instanceId, key, val),
    };
}

function makeSharedAccessor(group) {
    return {
        get: (key) => ModState.getSharedConfig(group, key),
        set: (key, val) => ModState.setSharedConfig(group, key, val),
    };
}

/**
 * Resolve the active provider for an instance — checks shared config first.
 */
function resolveProvider(inst, template) {
    if (!template) return inst.config?.provider;
    const schema = ModState.getSharedConfigSchema(template.group);
    if (schema?.some(f => f.key === 'provider')) {
        return ModState.getSharedConfig(template.group, 'provider') ?? inst.config?.provider;
    }
    return inst.config?.provider;
}

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

    // Select first instance (or first catalog item if none) and pass to
    // renderListPage so InfiniteList finds the .active class without
    // dispatching a redundant event.
    const instances = ModState.getInstances();
    if (instances.length > 0) {
        selectedInstanceId = instances[0].instanceId;
        renderListPage(selectedInstanceId);
        renderConfig(selectedInstanceId);
        renderInstanceActions(selectedInstanceId);
    } else {
        const templates = getAllTemplates();
        if (templates.length > 0) selectedTemplateId = templates[0].id;
        renderListPage(null, selectedTemplateId);
        if (selectedTemplateId) renderCatalogPreview(selectedTemplateId);
    }

    ModState.refreshAllServerStatuses().then(() => {
        updateServerIndicators();
    });
}

// ===================== List Page =====================

function renderListPage(activeInstanceId, activeTemplateId) {
    const container = elements.listContainer;
    if (!container) return;
    container.innerHTML = '';

    renderTemplateCatalog(container);
    renderActiveInstances(container);

    // Mark selected item BEFORE refresh so InfiniteList finds it via .active class
    if (activeInstanceId) {
        const target = container.querySelector(`.mods-list-item[data-instance-id="${activeInstanceId}"]`);
        if (target) target.classList.add('active');
    } else if (activeTemplateId) {
        const target = container.querySelector(`.mods-catalog-item[data-template-id="${activeTemplateId}"]`);
        if (target) target.classList.add('active');
    }

    if (infiniteList) {
        infiniteList.refresh();
    } else {
        infiniteList = new InfiniteList(container, '.mods-navigable');
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
        item.className = 'mods-catalog-item mods-navigable';
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
        item.className = 'mods-list-item mods-navigable';
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
        const activeProviderId = resolveProvider(inst, template);
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
    selectedTemplateId = null;
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

        // Select another instance, or fall back to first catalog item
        const remaining = ModState.getInstances();
        if (remaining.length > 0) {
            selectedInstanceId = remaining[0].instanceId;
            selectedTemplateId = null;
            renderListPage(selectedInstanceId);
            renderConfig(selectedInstanceId);
            renderInstanceActions(selectedInstanceId);
        } else {
            selectedInstanceId = null;
            const templates = getAllTemplates();
            selectedTemplateId = templates.length > 0 ? templates[0].id : null;
            renderListPage(null, selectedTemplateId);
            renderInstanceActions(null);
            if (selectedTemplateId) {
                renderCatalogPreview(selectedTemplateId);
            } else {
                if (elements.configDefault) elements.configDefault.style.display = '';
                if (elements.configTitle) elements.configTitle.textContent = '\u2014';
                if (elements.configDescription) elements.configDescription.textContent = '';
                if (elements.configFields) elements.configFields.innerHTML = '';
                if (elements.configStatus) elements.configStatus.style.display = 'none';
            }
        }
    });

    container.appendChild(deleteBtn);
}

/**
 * Show template preview in config page when a catalog item is selected.
 * Displays name + description + placeholder — no fields, no actions.
 */
function renderCatalogPreview(templateId) {
    const tpl = getTemplate(templateId);
    if (!tpl) return;

    if (elements.configTitle) elements.configTitle.textContent = t(tpl.nameKey);
    if (elements.configDescription) elements.configDescription.textContent = t(tpl.descriptionKey);
    if (elements.configFields) elements.configFields.innerHTML = '';
    if (elements.configStatus) elements.configStatus.style.display = 'none';
    if (elements.configRefreshBtn) elements.configRefreshBtn.style.display = 'none';
    if (elements.configDefault) {
        elements.configDefault.textContent = t('mods.catalogPreview');
        elements.configDefault.style.display = '';
    }
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
    const activeProviderId = resolveProvider(inst, template);
    const activeProvider = template.providers?.find(p => p.id === activeProviderId);
    if (elements.configRefreshBtn) {
        elements.configRefreshBtn.style.display = activeProvider?.type === 'server' ? '' : 'none';
    }
}

function renderConfigStatus(instanceId) {
    const inst = ModState.getInstance(instanceId);
    if (!elements.configStatus || !inst) return;

    const template = getTemplate(inst.templateId);
    const activeProviderId = resolveProvider(inst, template);
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

    // --- Shared config section (group-level) ---
    const sharedSchema = template?.group ? ModState.getSharedConfigSchema(template.group) : null;
    if (sharedSchema && sharedSchema.length > 0) {
        const sharedAccessor = makeSharedAccessor(template.group);

        const header = document.createElement('div');
        header.className = 'mods-config-section-header crt-text-orange';
        header.textContent = `\u2500\u2500 ${t('mods.sharedConfig')} \u2500\u2500`;
        elements.configFields.appendChild(header);

        for (const field of sharedSchema) {
            const fieldEl = createConfigField(sharedAccessor, template, field, sharedSchema);
            if (fieldEl) elements.configFields.appendChild(fieldEl);
        }
    }

    // --- Instance config section (per-instance) ---
    if (template?.configSchema && template.configSchema.length > 0) {
        const instanceAccessor = makeInstanceAccessor(instanceId);

        if (sharedSchema && sharedSchema.length > 0) {
            const header = document.createElement('div');
            header.className = 'mods-config-section-header crt-text-orange';
            header.textContent = `\u2500\u2500 ${t('mods.instanceConfig')} \u2500\u2500`;
            elements.configFields.appendChild(header);
        }

        for (const field of template.configSchema) {
            const fieldEl = createConfigField(instanceAccessor, template, field, template.configSchema);
            if (fieldEl) elements.configFields.appendChild(fieldEl);
        }
    }
}

// ===================== Config Field Creators =====================

function createConfigField(accessor, template, field, schema) {
    if (!evaluateShowWhen(accessor, field, schema)) return null;

    const isStacked = field.type === 'textarea' || field.type === 'icon-picker';

    const wrapper = document.createElement('div');
    wrapper.className = isStacked ? 'mods-config-field mods-config-field-stacked' : 'mods-config-field';
    wrapper.dataset.configKey = field.key;

    const label = document.createElement('div');
    label.className = 'mods-config-field-label';
    label.textContent = t(field.labelKey) || field.key;
    if (field.hintKey) label.dataset.hint = field.hintKey;
    wrapper.appendChild(label);

    const renderer = getRenderer(field.type);
    if (renderer) {
        wrapper.appendChild(renderer(accessor, template, field));
    }

    return wrapper;
}

function createSelectField(accessor, template, field) {
    const currentValue = accessor.get(field.key) ?? field.default ?? '';
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
            accessor.set(field.key, opt.value);
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

function createTextField(accessor, template, field) {
    const input = document.createElement('input');
    input.className = 'mods-config-field-input';
    input.type = 'text';
    input.value = accessor.get(field.key) ?? '';
    input.placeholder = field.placeholder || field.default || '';
    input.addEventListener('change', () => {
        accessor.set(field.key, input.value);
    });
    return input;
}

function createTextareaField(accessor, template, field) {
    const container = document.createElement('div');
    container.className = 'mods-textarea-field';

    const textarea = document.createElement('textarea');
    textarea.className = 'mods-config-field-textarea mod-scrollbar';
    textarea.rows = field.rows || 3;
    textarea.value = accessor.get(field.key) ?? field.default ?? '';
    textarea.placeholder = field.placeholder || '';
    textarea.addEventListener('change', () => {
        accessor.set(field.key, textarea.value);
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

function createIconPickerField(accessor, template, field) {
    const currentValue = accessor.get(field.key) ?? field.default ?? '';
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
            accessor.set(field.key, icon.value);
        });

        grid.appendChild(btn);
    }

    return grid;
}

function createRangeField(accessor, template, field) {
    const container = document.createElement('div');
    container.className = 'mods-config-range-group';

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'mods-config-field-range';
    input.min = field.min ?? 0;
    input.max = field.max ?? 100;
    input.step = field.step ?? 1;
    input.value = accessor.get(field.key) ?? field.default ?? input.min;

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'mods-config-range-value crt-text-green';
    valueDisplay.textContent = input.value;

    input.addEventListener('input', () => {
        valueDisplay.textContent = input.value;
    });
    input.addEventListener('change', () => {
        accessor.set(field.key, Number(input.value));
    });

    container.appendChild(input);
    container.appendChild(valueDisplay);
    return container;
}

function createToggleField(accessor, template, field) {
    const btn = document.createElement('button');
    const current = accessor.get(field.key) ?? field.default ?? false;
    btn.className = `mods-toggle-btn ${current ? 'enabled' : 'disabled'}`;
    btn.textContent = current ? t('mods.enabled') : t('mods.disabled');
    btn.addEventListener('click', () => {
        const newVal = !accessor.get(field.key);
        accessor.set(field.key, newVal);
        btn.className = `mods-toggle-btn ${newVal ? 'enabled' : 'disabled'}`;
        btn.textContent = newVal ? t('mods.enabled') : t('mods.disabled');
    });
    return btn;
}

function createInfoField(accessor, template, field) {
    const span = document.createElement('span');
    span.className = 'mods-config-field-info crt-text-green';
    if (typeof template.getInfoValue === 'function') {
        span.textContent = template.getInfoValue(field.key);
    } else {
        span.textContent = accessor.get(field.key) ?? '\u2014';
    }
    return span;
}

function createActionField(accessor, template, field) {
    const btn = document.createElement('button');
    btn.className = 'mods-config-field-action crt-text-green';
    btn.textContent = t(field.actionLabelKey) || field.key;
    btn.addEventListener('click', async () => {
        if (typeof template.onAction === 'function') {
            btn.disabled = true;
            try {
                await template.onAction(field.key);
            } finally {
                btn.disabled = false;
            }
        }
    });
    return btn;
}

function evaluateShowWhen(accessor, field, schema) {
    if (!field.showWhen) return true;
    let currentValue = accessor.get(field.showWhen.key);
    // Resolve default from schema when config key hasn't been set
    if (currentValue === null && schema) {
        const ref = schema.find(f => f.key === field.showWhen.key);
        if (ref && ref.default !== undefined) currentValue = ref.default;
    }
    return currentValue === field.showWhen.value;
}

// ===================== Events =====================

function bindEvents() {
    // InfiniteList selection → bifurcate: instance vs catalog item
    window.addEventListener('list:selectionChanged', ({ detail }) => {
        if (!elements.listContainer?.contains(detail.item)) return;

        const instanceId = detail.item?.dataset?.instanceId;
        const templateId = detail.item?.dataset?.templateId;

        clearTimeout(selectionTimer);

        if (instanceId) {
            // INSTANCE path — existing behavior
            selectedInstanceId = instanceId;
            selectedTemplateId = null;
            selectionTimer = setTimeout(() => {
                renderInstanceActions(instanceId);
                window.dispatchEvent(new CustomEvent('mods:selected', { detail: { instanceId } }));
            }, 500);
        } else if (templateId) {
            // CATALOG path — show preview, clear actions
            selectedInstanceId = null;
            selectedTemplateId = templateId;
            selectionTimer = setTimeout(() => {
                renderCatalogPreview(templateId);
                renderInstanceActions(null);
            }, 500);
        }
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

    // When navigating to config page, ensure selected item is rendered
    window.addEventListener('navi:pageChanged', ({ detail }) => {
        if (detail.page === 'mods-config') {
            if (selectedInstanceId) renderConfig(selectedInstanceId);
            else if (selectedTemplateId) renderCatalogPreview(selectedTemplateId);
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
        renderListPage(selectedInstanceId, selectedTemplateId);
        renderInstanceActions(selectedInstanceId);
    });

    // Re-render when shared config changes (affects all instances in the group)
    window.addEventListener('mods:sharedConfigChanged', () => {
        if (selectedInstanceId) {
            renderConfigFields(selectedInstanceId);
            renderConfigStatus(selectedInstanceId);
        }
        renderListPage(selectedInstanceId, selectedTemplateId);
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
