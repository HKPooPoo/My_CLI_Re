/**
 * MOD State Manager - Persistence & Runtime State
 * =================================================================
 * Manages enabled/disabled state and server health status for MODs.
 * Persists to localStorage. Dispatches 'mods:changed' on toggle.
 * =================================================================
 */

import { MOD_REGISTRY, MOD_TYPES } from './mod-registry.js';
import { ModService } from './services/mod-service.js';

const STORAGE_KEY = 'mod-states';

export const ModState = {
    _states: {},

    init() {
        // Load persisted states
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            this._states = saved;
        } catch {
            this._states = {};
        }

        // Ensure every registered MOD has a state entry
        for (const [id, def] of Object.entries(MOD_REGISTRY)) {
            if (!this._states[id]) {
                this._states[id] = {
                    enabled: def.defaultEnabled,
                    serverStatus: def.type === MOD_TYPES.CLIENT ? 'online' : 'unknown'
                };
            }
            // CLIENT mods are always "online"
            if (def.type === MOD_TYPES.CLIENT) {
                this._states[id].serverStatus = 'online';
            }
        }

        this._persist();
    },

    isEnabled(id) {
        return this._states[id]?.enabled ?? false;
    },

    getServerStatus(id) {
        return this._states[id]?.serverStatus ?? 'unknown';
    },

    setEnabled(id, enabled) {
        if (!this._states[id]) return;
        this._states[id].enabled = enabled;
        this._persist();
        window.dispatchEvent(new CustomEvent('mods:changed', { detail: { modId: id, enabled } }));
    },

    async refreshServerStatus(id) {
        const def = MOD_REGISTRY[id];
        if (!def || def.type === MOD_TYPES.CLIENT) return 'online';

        try {
            await ModService.checkHealth(id);
            this._states[id].serverStatus = 'online';
        } catch {
            this._states[id].serverStatus = 'offline';
        }

        this._persist();
        return this._states[id].serverStatus;
    },

    async refreshAllServerStatuses() {
        const promises = Object.entries(MOD_REGISTRY)
            .filter(([, def]) => def.type === MOD_TYPES.SERVER)
            .map(([id]) => this.refreshServerStatus(id));
        await Promise.allSettled(promises);
    },

    _persist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._states));
    }
};
