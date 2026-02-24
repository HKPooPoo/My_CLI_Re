/**
 * MOD State Manager - Persistence & Runtime State
 * =================================================================
 * Manages enabled/disabled state, server health, and per-MOD config.
 * Persists to localStorage. Dispatches 'mods:changed' on toggle.
 * =================================================================
 */

import { MOD_REGISTRY, MOD_TYPES } from './mod-registry.js';
import { ModService } from './services/mod-service.js';

const STATES_KEY = 'mod-states';
const CONFIGS_KEY = 'mod-configs';

export const ModState = {
    _states: {},
    _configs: {},

    init() {
        try {
            this._states = JSON.parse(localStorage.getItem(STATES_KEY) || '{}');
        } catch {
            this._states = {};
        }
        try {
            this._configs = JSON.parse(localStorage.getItem(CONFIGS_KEY) || '{}');
        } catch {
            this._configs = {};
        }

        for (const [id, def] of Object.entries(MOD_REGISTRY)) {
            if (!this._states[id]) {
                this._states[id] = {
                    enabled: def.defaultEnabled,
                    serverStatus: def.type === MOD_TYPES.CLIENT ? 'online' : 'unknown'
                };
            }
            if (def.type === MOD_TYPES.CLIENT) {
                this._states[id].serverStatus = 'online';
            }
            // Initialise config defaults
            if (!this._configs[id]) {
                this._configs[id] = {};
                for (const field of (def.config || [])) {
                    if (field.default !== undefined) {
                        this._configs[id][field.key] = field.default;
                    }
                }
            }
        }

        this._persistStates();
        this._persistConfigs();
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
        this._persistStates();
        window.dispatchEvent(new CustomEvent('mods:changed', { detail: { modId: id, enabled } }));
    },

    getConfig(id, key) {
        return this._configs[id]?.[key] ?? null;
    },

    setConfig(id, key, value) {
        if (!this._configs[id]) this._configs[id] = {};
        this._configs[id][key] = value;
        this._persistConfigs();
        window.dispatchEvent(new CustomEvent('mods:configChanged', { detail: { modId: id, key, value } }));
    },

    /**
     * Refresh server status. MODs sharing the same healthEndpoint
     * are deduped — one HTTP call updates all of them.
     */
    async refreshServerStatus(id) {
        const def = MOD_REGISTRY[id];
        if (!def || def.type === MOD_TYPES.CLIENT) return 'online';
        if (!def.healthEndpoint) return 'online';

        try {
            await ModService.checkHealth(def.healthEndpoint);
            this._setServerStatusByEndpoint(def.healthEndpoint, 'online');
        } catch {
            this._setServerStatusByEndpoint(def.healthEndpoint, 'offline');
        }

        this._persistStates();
        return this._states[id].serverStatus;
    },

    async refreshAllServerStatuses() {
        // Collect unique health endpoints
        const endpointMap = {};
        for (const [id, def] of Object.entries(MOD_REGISTRY)) {
            if (def.type === MOD_TYPES.SERVER && def.healthEndpoint) {
                if (!endpointMap[def.healthEndpoint]) {
                    endpointMap[def.healthEndpoint] = [];
                }
                endpointMap[def.healthEndpoint].push(id);
            }
        }

        const promises = Object.keys(endpointMap).map(async (endpoint) => {
            try {
                await ModService.checkHealth(endpoint);
                this._setServerStatusByEndpoint(endpoint, 'online');
            } catch {
                this._setServerStatusByEndpoint(endpoint, 'offline');
            }
        });

        await Promise.allSettled(promises);
        this._persistStates();
    },

    _setServerStatusByEndpoint(endpoint, status) {
        for (const [id, def] of Object.entries(MOD_REGISTRY)) {
            if (def.healthEndpoint === endpoint) {
                if (this._states[id]) {
                    this._states[id].serverStatus = status;
                }
            }
        }
    },

    _persistStates() {
        localStorage.setItem(STATES_KEY, JSON.stringify(this._states));
    },

    _persistConfigs() {
        localStorage.setItem(CONFIGS_KEY, JSON.stringify(this._configs));
    }
};
