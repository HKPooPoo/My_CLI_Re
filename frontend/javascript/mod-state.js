/**
 * MOD State Manager - Persistence & Runtime State
 * =================================================================
 * Manages enabled/disabled state, server health, and per-MOD config.
 * Persists to localStorage. Dispatches 'mods:changed' on toggle.
 *
 * Decoupled from MOD definitions — MODs register themselves via
 * registerMod() called by the loader during init.
 * =================================================================
 */

import { ModService } from './services/mod-service.js';

const STATES_KEY = 'mod-states';
const CONFIGS_KEY = 'mod-configs';
const SHARED_CONFIGS_KEY = 'mod-shared-configs';

// Old v1 MOD IDs that should be migrated
const V1_TRANSLATE_IDS = [
    'translate-zh-TW-online', 'translate-zh-TW-offline',
    'translate-zh-CN-online', 'translate-zh-CN-offline',
    'translate-en-online', 'translate-en-offline',
    'translate-ja-online', 'translate-ja-offline'
];

export const ModState = {
    _states: {},
    _configs: {},
    _sharedConfigs: {},
    _registry: {},  // MOD definitions registered by loader

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
        try {
            this._sharedConfigs = JSON.parse(localStorage.getItem(SHARED_CONFIGS_KEY) || '{}');
        } catch {
            this._sharedConfigs = {};
        }

        this._migrateV1();
    },

    /**
     * Register a MOD definition. Called by mod-loader for each MOD.
     * Initialises state/config defaults if not already persisted.
     */
    registerMod(id, def) {
        this._registry[id] = def;

        if (!this._states[id]) {
            this._states[id] = {
                enabled: def.defaultEnabled ?? false,
                serverStatus: 'unknown'
            };
        }

        // CLIENT-only providers always show 'online'
        if (def.providers?.every(p => p.type === 'client' || p.type === 'cloud')) {
            this._states[id].serverStatus = 'online';
        }

        // Initialise config defaults from configSchema
        if (!this._configs[id]) {
            this._configs[id] = {};
        }
        for (const field of (def.configSchema || [])) {
            if (field.default !== undefined && this._configs[id][field.key] === undefined) {
                this._configs[id][field.key] = field.default;
            }
        }

        this._persistStates();
        this._persistConfigs();
    },

    /**
     * Get the registered MOD definition.
     */
    getModDef(id) {
        return this._registry[id] ?? null;
    },

    /**
     * Get all registered MOD definitions.
     */
    getAllModDefs() {
        return this._registry;
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

    // --- Shared config (for MOD groups like 'llm') ---

    getSharedConfig(group, key) {
        return this._sharedConfigs[group]?.[key] ?? null;
    },

    setSharedConfig(group, key, value) {
        if (!this._sharedConfigs[group]) this._sharedConfigs[group] = {};
        this._sharedConfigs[group][key] = value;
        localStorage.setItem(SHARED_CONFIGS_KEY, JSON.stringify(this._sharedConfigs));
        window.dispatchEvent(new CustomEvent('mods:sharedConfigChanged', { detail: { group, key, value } }));
    },

    // --- Server status ---

    async refreshServerStatus(id) {
        const def = this._registry[id];
        if (!def) return 'unknown';

        // Find the active provider's health endpoint
        const providerKey = this.getConfig(id, 'provider');
        const provider = def.providers?.find(p => p.id === providerKey);
        if (!provider?.healthEndpoint) return 'online';

        try {
            await ModService.checkHealth(provider.healthEndpoint);
            this._setServerStatus(id, 'online');
        } catch {
            this._setServerStatus(id, 'offline');
        }

        this._persistStates();
        return this._states[id].serverStatus;
    },

    async refreshAllServerStatuses() {
        const endpointMap = {};

        for (const [id, def] of Object.entries(this._registry)) {
            const providerKey = this.getConfig(id, 'provider');
            const provider = def.providers?.find(p => p.id === providerKey);
            if (provider?.healthEndpoint) {
                if (!endpointMap[provider.healthEndpoint]) {
                    endpointMap[provider.healthEndpoint] = [];
                }
                endpointMap[provider.healthEndpoint].push(id);
            }
        }

        const promises = Object.entries(endpointMap).map(async ([endpoint, ids]) => {
            try {
                await ModService.checkHealth(endpoint);
                ids.forEach(id => this._setServerStatus(id, 'online'));
            } catch {
                ids.forEach(id => this._setServerStatus(id, 'offline'));
            }
        });

        await Promise.allSettled(promises);
        this._persistStates();
    },

    _setServerStatus(id, status) {
        if (this._states[id]) {
            this._states[id].serverStatus = status;
        }
    },

    /**
     * Migrate v1 localStorage (8 translate-* MODs) to v2 (1 translate MOD).
     * Detects old keys and collapses them. Runs once, then old keys are cleaned up.
     */
    _migrateV1() {
        const hasV1 = V1_TRANSLATE_IDS.some(id => this._states[id] !== undefined);
        if (!hasV1) return;

        // If any online translate was enabled, keep translate enabled
        const anyOnlineEnabled = V1_TRANSLATE_IDS
            .filter(id => id.endsWith('-online'))
            .some(id => this._states[id]?.enabled);

        // Check if any offline was enabled → set provider to libretranslate
        const anyOfflineEnabled = V1_TRANSLATE_IDS
            .filter(id => id.endsWith('-offline'))
            .some(id => this._states[id]?.enabled);

        // Set new translate MOD state
        if (!this._states['translate']) {
            this._states['translate'] = {
                enabled: anyOnlineEnabled || anyOfflineEnabled,
                serverStatus: 'unknown'
            };
        }

        // Set provider config
        if (!this._configs['translate']) {
            this._configs['translate'] = {};
        }
        if (anyOfflineEnabled) {
            this._configs['translate'].provider = 'libretranslate';
        } else {
            this._configs['translate'].provider = 'google';
        }

        // Clean up old v1 keys
        for (const id of V1_TRANSLATE_IDS) {
            delete this._states[id];
            delete this._configs[id];
        }

        this._persistStates();
        this._persistConfigs();
        console.info('[mod-state] Migrated v1 translate MODs to v2');
    },

    _persistStates() {
        localStorage.setItem(STATES_KEY, JSON.stringify(this._states));
    },

    _persistConfigs() {
        localStorage.setItem(CONFIGS_KEY, JSON.stringify(this._configs));
    }
};
