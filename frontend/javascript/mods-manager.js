/**
 * MOD Manager - Instance-Based UI Controller
 * =================================================================
 * List page: Two-container layout — template catalog + active instances.
 * Config page: Instance config with reorder/delete actions.
 * =================================================================
 */

import { getAllTemplates, getTemplate, getInstances, getInstancesByTemplate,
         rebuildInstanceButtons, removeInstanceButton, updateInstanceButton } from '../mods/mod-loader.js';
import { ModState } from './mod-state.js';
import { InfiniteList } from './blackboard-ui-list.js';
import { MultiStepButton } from './multiStepButton.js';
import { BBMessage } from './blackboard-msg.js';
import { playAudio } from './audio.js';
import { t } from './i18n.js';

let infiniteList = null;
let selectionTimer = null;
let selectedInstanceId = null;

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
    bindEvents();
    renderListPage();

    // Select first instance
    const firstItem = elements.listContainer?.querySelector('.mods-list-item[data-instance-id]');
    if (firstItem?.dataset?.instanceId) {
        renderConfig(firstItem.dataset.instanceId);
    }

    ModState.refreshAllServerStatuses().then(() => {
        updateServerIndicators();
    });
}

// ===================== List Page =====================

function renderListPage() {
    const container = elements.listContainer;
    if (!container) return;
    container.innerHTML = '';

    renderTemplateCatalog(container);
    renderActiveInstances(container);

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
        const isSingletonWithInstance = tpl.singleton && instances.length > 0;

        const item = document.createElement('div');
        item.className = 'mods-catalog-item';
        item.dataset.templateId = tpl.id;

        const nameEl = document.createElement('div');
        nameEl.className = 'mods-catalog-item-name';
        nameEl.textContent = t(tpl.nameKey);

        item.appendChild(nameEl);

        if (isSingletonWithInstance) {
            const addedLabel = document.createElement('span');
            addedLabel.className = 'mods-catalog-added crt-text-green';
            addedLabel.textContent = t('mods.singletonAdded');
            item.appendChild(addedLabel);
        } else if (!tpl.singleton || instances.length === 0) {
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

        const enabled = ModState.isEnabled(inst.instanceId);
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

        const toggleBtn = document.createElement('button');
        toggleBtn.className = `mods-toggle-btn ${enabled ? 'enabled' : 'disabled'}`;
        toggleBtn.textContent = enabled ? t('mods.enabled') : t('mods.disabled');
        toggleBtn.dataset.instanceId = inst.instanceId;

        item.appendChild(info);
        item.appendChild(toggleBtn);
        container.appendChild(item);
    }
}

function handleAddInstance(templateId) {
    playAudio('UISelectOn.mp3');
    const instance = ModState.addInstance(templateId);
    if (!instance) {
        BBMessage.error(t('mods.singletonAdded'));
        return;
    }
    // Rebuild buttons and re-render list
    rebuildInstanceButtons();
    renderListPage();

    // Auto-select new instance
    renderConfig(instance.instanceId);
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
    renderConfigActions(instanceId);

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

    const template = getTemplate(inst.templateId);

    // Remove only non-action fields (preserve actions section if re-rendering)
    const existingActions = elements.configFields.querySelector('.mods-instance-actions');
    elements.configFields.innerHTML = '';

    if (template?.configSchema && template.configSchema.length > 0) {
        for (const field of template.configSchema) {
            const fieldEl = createConfigField(instanceId, template, field);
            if (fieldEl) elements.configFields.appendChild(fieldEl);
        }
    }

    // Re-append actions if they existed, otherwise they'll be added by renderConfigActions
    if (existingActions) elements.configFields.appendChild(existingActions);
}

function renderConfigActions(instanceId) {
    const inst = ModState.getInstance(instanceId);
    if (!elements.configFields || !inst) return;

    const template = getTemplate(inst.templateId);

    // Remove existing actions
    elements.configFields.querySelector('.mods-instance-actions')?.remove();

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'mods-instance-actions';

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
        renderListPage();
        renderConfigActions(instanceId);
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
        renderListPage();
        renderConfigActions(instanceId);
    });

    actionsContainer.appendChild(upBtn);
    actionsContainer.appendChild(downBtn);

    // DELETE (hidden for singletons)
    if (!template?.singleton) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'mods-action-btn mods-action-delete crt-text-red';
        deleteBtn.textContent = t('mods.deleteInstance');

        new MultiStepButton(deleteBtn, {
            confirm: true,
            confirmLabel: t('mods.deleteConfirm'),
            action: () => {
                playAudio('UIGeneralCancel.mp3');
                removeInstanceButton(instanceId);
                ModState.removeInstance(instanceId);
                renderListPage();

                // Select another instance or show default
                const remaining = ModState.getInstances();
                if (remaining.length > 0) {
                    renderConfig(remaining[0].instanceId);
                } else {
                    selectedInstanceId = null;
                    if (elements.configDefault) elements.configDefault.style.display = '';
                    if (elements.configTitle) elements.configTitle.textContent = '\u2014';
                    if (elements.configDescription) elements.configDescription.textContent = '';
                    if (elements.configFields) elements.configFields.innerHTML = '';
                    if (elements.configStatus) elements.configStatus.style.display = 'none';
                }
            }
        });

        actionsContainer.appendChild(deleteBtn);
    }

    elements.configFields.appendChild(actionsContainer);
}

// ===================== Config Field Creators =====================

function createConfigField(instanceId, template, field) {
    if (!evaluateShowWhen(instanceId, field)) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'mods-config-field';
    wrapper.dataset.configKey = field.key;

    const label = document.createElement('div');
    label.className = 'mods-config-field-label';
    label.textContent = t(field.labelKey) || field.key;
    wrapper.appendChild(label);

    switch (field.type) {
        case 'select':
            wrapper.appendChild(createSelectField(instanceId, field));
            break;
        case 'text':
            wrapper.appendChild(createTextField(instanceId, field));
            break;
        case 'range':
            wrapper.appendChild(createRangeField(instanceId, field));
            break;
        case 'toggle':
            wrapper.appendChild(createToggleField(instanceId, field));
            break;
        case 'info':
            wrapper.appendChild(createInfoField(instanceId, template, field));
            break;
        case 'action':
            wrapper.appendChild(createActionField(instanceId, template, field));
            break;
        default:
            wrapper.appendChild(createTextField(instanceId, field));
    }

    return wrapper;
}

function createSelectField(instanceId, field) {
    const select = document.createElement('select');
    select.className = 'mods-config-field-select';
    for (const opt of (field.options || [])) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = t(opt.labelKey) || opt.value;
        select.appendChild(option);
    }
    select.value = ModState.getConfig(instanceId, field.key) ?? field.default ?? '';
    select.addEventListener('change', () => {
        ModState.setConfig(instanceId, field.key, select.value);
    });
    return select;
}

function createTextField(instanceId, field) {
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

function createRangeField(instanceId, field) {
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

function createToggleField(instanceId, field) {
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
    const currentValue = ModState.getConfig(instanceId, field.showWhen.key);
    return currentValue === field.showWhen.value;
}

// ===================== Events =====================

function bindEvents() {
    // Toggle button delegation on list
    elements.listContainer?.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.mods-toggle-btn');
        if (!toggleBtn) return;

        e.stopPropagation();

        const instanceId = toggleBtn.dataset.instanceId;
        const inst = ModState.getInstance(instanceId);
        if (!inst) return;

        const template = getTemplate(inst.templateId);
        const currentlyEnabled = ModState.isEnabled(instanceId);

        if (!currentlyEnabled && template) {
            const hasServer = template.providers?.some(p => p.type === 'server');
            if (hasServer) {
                const status = ModState.getServerStatus(instanceId);
                if (status === 'offline') {
                    BBMessage.error(t('mods.serverOfflineWarning'));
                }
            }
        }

        const newState = !currentlyEnabled;
        ModState.setEnabled(instanceId, newState);

        playAudio(newState ? 'UISelectOn.mp3' : 'UISelectOff.mp3');

        toggleBtn.className = `mods-toggle-btn ${newState ? 'enabled' : 'disabled'}`;
        toggleBtn.textContent = newState ? t('mods.enabled') : t('mods.disabled');
    });

    // InfiniteList selection → debounce → show config
    window.addEventListener('list:selectionChanged', ({ detail }) => {
        if (!elements.listContainer?.contains(detail.item)) return;

        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(() => {
            const instanceId = detail.item?.dataset?.instanceId;
            if (instanceId) {
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
        const msg = BBMessage.info(t('mods.refreshing'));

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
        // Update button icon if config changed
        if (detail.instanceId) {
            updateInstanceButton(detail.instanceId);
        }

        if (detail.key === 'provider') {
            renderListPage();
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
    });

    // Instance add/remove → re-render
    window.addEventListener('mods:instanceAdded', () => {
        renderListPage();
    });

    window.addEventListener('mods:instanceRemoved', () => {
        renderListPage();
    });

    window.addEventListener('mods:reordered', () => {
        renderListPage();
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
