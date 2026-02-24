/**
 * MOD Manager - UI Controller for the MODS navigation section
 * =================================================================
 * Renders the MOD list, handles toggle events, and refreshes status.
 * =================================================================
 */

import { MOD_REGISTRY, MOD_TYPES } from './mod-registry.js';
import { ModState } from './mod-state.js';
import { BBMessage } from './blackboard-msg.js';
import { playAudio } from './audio.js';
import { t } from './i18n.js';

const ModsManager = {
    elements: {
        listContainer: document.querySelector('.mods-list-container'),
        refreshBtn: document.getElementById('mods-refresh-btn'),
        diagnosticsContainer: document.getElementById('mods-diagnostics')
    },

    init() {
        ModState.init();
        this.renderModList();
        this.renderDiagnostics();
        this.bindEvents();

        // Background refresh server statuses
        ModState.refreshAllServerStatuses().then(() => {
            this.renderModList();
            this.renderDiagnostics();
        });
    },

    renderModList() {
        const container = this.elements.listContainer;
        if (!container) return;

        container.innerHTML = '';

        for (const [id, def] of Object.entries(MOD_REGISTRY)) {
            const enabled = ModState.isEnabled(id);
            const serverStatus = ModState.getServerStatus(id);

            const item = document.createElement('div');
            item.className = 'mods-list-item';
            item.dataset.modId = id;

            // Header: name + server status
            const header = document.createElement('div');
            header.className = 'mods-list-item-header';

            const nameEl = document.createElement('div');
            nameEl.className = 'mods-list-item-name';
            nameEl.textContent = t(def.nameKey);

            header.appendChild(nameEl);

            if (def.type === MOD_TYPES.SERVER) {
                const indicator = document.createElement('div');
                indicator.className = `mods-server-indicator ${serverStatus}`;
                indicator.textContent = t(`mods.status.${serverStatus}`);
                header.appendChild(indicator);
            }

            // Description
            const descEl = document.createElement('div');
            descEl.className = 'mods-list-item-description';
            descEl.textContent = t(def.descriptionKey);

            // Controls: type label + toggle
            const controls = document.createElement('div');
            controls.className = 'mods-list-item-controls';

            const typeEl = document.createElement('div');
            typeEl.className = 'mods-list-item-type';
            typeEl.textContent = def.type.toUpperCase();

            const toggleBtn = document.createElement('button');
            toggleBtn.className = `mods-toggle-btn ${enabled ? 'enabled' : 'disabled'}`;
            toggleBtn.textContent = enabled ? t('mods.enabled') : t('mods.disabled');
            toggleBtn.dataset.modId = id;

            controls.appendChild(typeEl);
            controls.appendChild(toggleBtn);

            item.appendChild(header);
            item.appendChild(descEl);
            item.appendChild(controls);
            container.appendChild(item);
        }
    },

    renderDiagnostics() {
        const container = this.elements.diagnosticsContainer;
        if (!container) return;

        container.innerHTML = '';

        for (const [id, def] of Object.entries(MOD_REGISTRY)) {
            const enabled = ModState.isEnabled(id);
            const serverStatus = ModState.getServerStatus(id);

            const row = document.createElement('div');
            row.className = 'mods-diagnostics-item';

            const label = document.createElement('span');
            label.textContent = t(def.nameKey);

            const status = document.createElement('span');
            status.className = `mods-server-indicator ${serverStatus}`;
            status.textContent = `${enabled ? t('mods.enabled') : t('mods.disabled')} | ${t(`mods.status.${serverStatus}`)}`;

            row.appendChild(label);
            row.appendChild(status);
            container.appendChild(row);
        }
    },

    bindEvents() {
        // Toggle button delegation
        this.elements.listContainer?.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('.mods-toggle-btn');
            if (!toggleBtn) return;

            const modId = toggleBtn.dataset.modId;
            const def = MOD_REGISTRY[modId];
            if (!def) return;

            const currentlyEnabled = ModState.isEnabled(modId);

            // Warn if enabling a server MOD that is offline
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

            this.renderDiagnostics();
        });

        // Refresh button
        this.elements.refreshBtn?.addEventListener('click', async () => {
            playAudio('UIGeneralFocus.mp3');
            const msg = BBMessage.info(t('mods.refreshing'));

            await ModState.refreshAllServerStatuses();
            this.renderModList();
            this.renderDiagnostics();

            msg.update(t('mods.refreshComplete'));
        });
    }
};

ModsManager.init();
