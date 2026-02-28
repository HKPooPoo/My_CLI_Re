/**
 * MOD State Manager - Instance-Based Architecture (ADD/DELETE model)
 * =================================================================
 * Manages instances (1 instance = 1 feature button), templates,
 * server health, and per-instance config.
 * Instance existence = enabled. No separate ON/OFF toggle.
 * Persists instances to localStorage as a single ordered array.
 * No auto-instantiation: first boot starts with zero instances.
 * User adds instances manually via the template catalog.
 * =================================================================
 */

import { ModService } from './services/mod-service.js';
import { ModHooks } from './mod-hooks.js';

/**
 * Late-bound context factory — set by mod-loader.js to break circular dependency.
 * Used to build a ModContext for onConfigChange callbacks.
 */
let _contextFactory = null;

/**
 * Inject the ModContext factory. Called once by mod-loader.js after boot.
 * @param {Function} factory  (opts) => ModContext
 */
export function setContextFactory(factory) {
    _contextFactory = factory;
}

const INSTANCES_KEY = 'mod-instances';
const SHARED_CONFIG_KEY = 'mod-shared-config';

// Legacy keys for migration
const LEGACY_STATES_KEY = 'mod-states';
const LEGACY_CONFIGS_KEY = 'mod-configs';

// Old v1 MOD IDs that should be migrated
const V1_TRANSLATE_IDS = [
    'translate-zh-TW-online', 'translate-zh-TW-offline',
    'translate-zh-CN-online', 'translate-zh-CN-offline',
    'translate-en-online', 'translate-en-offline',
    'translate-ja-online', 'translate-ja-offline'
];

export const ModState = {
    _templates: {},       // registered template definitions
    _instances: [],       // ordered array of instance objects
    _serverStatuses: {},  // instanceId → 'online'|'offline'|'unknown'
    _sharedConfig: {},    // group → { key: value } shared config across group

    init() {
        try {
            this._instances = JSON.parse(localStorage.getItem(INSTANCES_KEY) || '[]');
        } catch {
            this._instances = [];
        }
        try {
            this._sharedConfig = JSON.parse(localStorage.getItem(SHARED_CONFIG_KEY) || '{}');
        } catch {
            this._sharedConfig = {};
        }
        // Clean up legacy dismissed key (no longer used)
        localStorage.removeItem('mod-dismissed');

        // Boot cleanup: remove legacy enabled:false instances, strip vestigial field
        const beforeCount = this._instances.length;
        this._instances = this._instances.filter(inst => {
            if (inst.enabled === false) {
                delete this._serverStatuses[inst.instanceId];
                return false;
            }
            delete inst.enabled;
            return true;
        });
        if (beforeCount !== this._instances.length) {
            this._persistInstances();
        }

        // Initialise server statuses from instances
        for (const inst of this._instances) {
            this._serverStatuses[inst.instanceId] = 'unknown';
        }
    },

    // ===================== Template Management =====================

    /**
     * Register a template definition. Called by mod-loader for each MOD.
     */
    registerTemplate(id, def) {
        this._templates[id] = def;
    },

    getTemplate(id) {
        return this._templates[id] ?? null;
    },

    getAllTemplates() {
        return this._templates;
    },

    // ===================== Instance CRUD =====================

    /**
     * Get all instances, ordered by `order` field.
     */
    getInstances() {
        return [...this._instances].sort((a, b) => a.order - b.order);
    },

    /**
     * Get instances for a specific template, ordered.
     */
    getInstancesByTemplate(templateId) {
        return this.getInstances().filter(i => i.templateId === templateId);
    },

    /**
     * Get a single instance by ID.
     */
    getInstance(instanceId) {
        return this._instances.find(i => i.instanceId === instanceId) ?? null;
    },

    /**
     * Create a new instance from a template.
     * @param {string} templateId
     * @param {object} [config] - optional initial config (merged with schema defaults)
     * @returns {object} the created instance
     */
    addInstance(templateId, config) {
        const template = this._templates[templateId];
        if (!template) return null;

        // Enforce maxInstances limit (0 or omitted = unlimited)
        const max = template.maxInstances || 0;
        if (max > 0 && this.getInstancesByTemplate(templateId).length >= max) {
            return null;
        }

        // Compute default config from schema
        const defaultConfig = {};
        for (const field of (template.configSchema || [])) {
            if (field.default !== undefined) {
                defaultConfig[field.key] = field.default;
            }
        }

        // Max order + 1
        const maxOrder = this._instances.reduce((max, i) => Math.max(max, i.order), -1);

        const instance = {
            instanceId: 'i_' + templateId + '_' + Date.now(),
            templateId,
            order: maxOrder + 1,
            config: { ...defaultConfig, ...(config || {}) }
        };

        this._instances.push(instance);
        this._serverStatuses[instance.instanceId] = 'unknown';

        // Set initial server status based on provider
        this._updateInstanceServerStatus(instance);

        this._persistInstances();
        window.dispatchEvent(new CustomEvent('mods:instanceAdded', { detail: { instance } }));
        return instance;
    },

    /**
     * Remove an instance by ID.
     */
    removeInstance(instanceId) {
        const idx = this._instances.findIndex(i => i.instanceId === instanceId);
        if (idx === -1) return;

        const instance = { ...this._instances[idx] };  // shallow copy BEFORE splice

        // Cleanup hooks owned by this instance
        ModHooks.unregisterAll(instanceId);

        this._instances.splice(idx, 1);
        delete this._serverStatuses[instanceId];
        this._persistInstances();
        window.dispatchEvent(new CustomEvent('mods:instanceRemoved', {
            detail: { instanceId, templateId: instance.templateId, instance }
        }));
    },

    // ===================== Instance State =====================

    getConfig(instanceId, key) {
        const inst = this.getInstance(instanceId);
        return inst?.config?.[key] ?? null;
    },

    setConfig(instanceId, key, value) {
        const inst = this.getInstance(instanceId);
        if (!inst) return;
        if (!inst.config) inst.config = {};
        inst.config[key] = value;

        // If provider changed, re-evaluate server status
        if (key === 'provider') {
            this._updateInstanceServerStatus(inst);
        }

        this._persistInstances();

        // Call template's onConfigChange callback if exists
        const template = this._templates[inst.templateId];
        if (template && typeof template.onConfigChange === 'function') {
            let ctx = null;
            if (_contextFactory) {
                try {
                    ctx = _contextFactory({
                        instanceId: inst.instanceId,
                        templateId: inst.templateId,
                        page: null,
                        buttonId: null,
                        config: inst.config,
                        template,
                    });
                } catch (_) { /* best-effort */ }
            }
            try {
                template.onConfigChange(ctx, key, value);
            } catch (e) {
                console.error(`[mod-state] onConfigChange failed for ${inst.templateId}:`, e);
            }
        }

        window.dispatchEvent(new CustomEvent('mods:configChanged', {
            detail: { instanceId, templateId: inst.templateId, key, value }
        }));
    },

    /**
     * Reorder an instance to a new position.
     * @param {string} instanceId
     * @param {number} direction - -1 for up, +1 for down
     */
    reorderInstance(instanceId, direction) {
        const sorted = this.getInstances();
        const idx = sorted.findIndex(i => i.instanceId === instanceId);
        if (idx === -1) return;

        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= sorted.length) return;

        // Swap order values
        const tmpOrder = sorted[idx].order;
        sorted[idx].order = sorted[targetIdx].order;
        sorted[targetIdx].order = tmpOrder;

        this._persistInstances();
        window.dispatchEvent(new CustomEvent('mods:reordered', {
            detail: { instanceId, direction }
        }));
    },

    // ===================== Shared Config (group-level) =====================

    getSharedConfig(group, key) {
        return this._sharedConfig[group]?.[key] ?? null;
    },

    setSharedConfig(group, key, value) {
        if (!this._sharedConfig[group]) this._sharedConfig[group] = {};
        this._sharedConfig[group][key] = value;
        this._persistSharedConfig();

        // Notify all templates in this group via onSharedConfigChange
        for (const tpl of Object.values(this._templates)) {
            if (tpl.group === group && typeof tpl.onSharedConfigChange === 'function') {
                try { tpl.onSharedConfigChange(key, value); } catch (e) {
                    console.error(`[mod-state] onSharedConfigChange failed for ${tpl.id}:`, e);
                }
            }
        }

        // Re-evaluate server statuses for instances in this group when provider changes
        if (key === 'provider') {
            for (const inst of this._instances) {
                const tpl = this._templates[inst.templateId];
                if (tpl?.group === group) this._updateInstanceServerStatus(inst);
            }
        }

        window.dispatchEvent(new CustomEvent('mods:sharedConfigChanged', {
            detail: { group, key, value }
        }));
    },

    getSharedConfigAll(group) {
        return { ...(this._sharedConfig[group] || {}) };
    },

    /**
     * Find the sharedConfigSchema for a group.
     * Scans templates in the group; returns the first one found (or null).
     */
    getSharedConfigSchema(group) {
        for (const tpl of Object.values(this._templates)) {
            if (tpl.group === group && Array.isArray(tpl.sharedConfigSchema)) {
                return tpl.sharedConfigSchema;
            }
        }
        return null;
    },

    /**
     * Initialize shared config defaults for a group from its schema.
     * Only sets keys that are not yet configured.
     */
    initSharedDefaults(group, schema) {
        if (!this._sharedConfig[group]) this._sharedConfig[group] = {};
        let changed = false;
        for (const field of schema) {
            if (field.default !== undefined && this._sharedConfig[group][field.key] === undefined) {
                this._sharedConfig[group][field.key] = field.default;
                changed = true;
            }
        }
        if (changed) this._persistSharedConfig();
    },

    // ===================== Server Status =====================

    getServerStatus(instanceId) {
        return this._serverStatuses[instanceId] ?? 'unknown';
    },

    /**
     * Resolve the active provider key for an instance.
     * Uses shared config if the group has a shared provider field.
     */
    _resolveProvider(inst) {
        const template = this._templates[inst.templateId];
        if (!template) return inst.config?.provider;
        const schema = this.getSharedConfigSchema(template.group);
        if (schema?.some(f => f.key === 'provider')) {
            return this.getSharedConfig(template.group, 'provider') ?? inst.config?.provider;
        }
        return inst.config?.provider;
    },

    async refreshServerStatus(instanceId) {
        const inst = this.getInstance(instanceId);
        if (!inst) return 'unknown';

        const template = this._templates[inst.templateId];
        if (!template) return 'unknown';

        const providerKey = this._resolveProvider(inst);
        const provider = template.providers?.find(p => p.id === providerKey);
        if (!provider?.healthEndpoint) {
            this._serverStatuses[instanceId] = 'online';
            return 'online';
        }

        try {
            await ModService.checkHealth(provider.healthEndpoint);
            this._serverStatuses[instanceId] = 'online';
        } catch {
            this._serverStatuses[instanceId] = 'offline';
        }

        return this._serverStatuses[instanceId];
    },

    async refreshAllServerStatuses() {
        const endpointMap = {};

        for (const inst of this._instances) {
            const template = this._templates[inst.templateId];
            if (!template) continue;

            const providerKey = this._resolveProvider(inst);
            const provider = template.providers?.find(p => p.id === providerKey);
            if (provider?.healthEndpoint) {
                if (!endpointMap[provider.healthEndpoint]) {
                    endpointMap[provider.healthEndpoint] = [];
                }
                endpointMap[provider.healthEndpoint].push(inst.instanceId);
            }
        }

        const promises = Object.entries(endpointMap).map(async ([endpoint, ids]) => {
            try {
                await ModService.checkHealth(endpoint);
                ids.forEach(id => { this._serverStatuses[id] = 'online'; });
            } catch {
                ids.forEach(id => { this._serverStatuses[id] = 'offline'; });
            }
        });

        await Promise.allSettled(promises);
    },

    // ===================== Migration =====================

    /**
     * Migrate from v2 (mod-states + mod-configs) to v3 (mod-instances).
     * Called after all templates are registered. Preserves existing user data.
     */
    migrateV2ToV3() {
        // First handle v1 → v2 migration (in case we have v1 data)
        this._migrateV1ToV2();

        // Check if v2 data exists
        let legacyStates, legacyConfigs;
        try {
            legacyStates = JSON.parse(localStorage.getItem(LEGACY_STATES_KEY) || '{}');
            legacyConfigs = JSON.parse(localStorage.getItem(LEGACY_CONFIGS_KEY) || '{}');
        } catch {
            return;
        }

        if (Object.keys(legacyStates).length === 0) return;

        // Already migrated (instances exist)
        if (this._instances.length > 0) {
            // Clean up legacy keys
            localStorage.removeItem(LEGACY_STATES_KEY);
            localStorage.removeItem(LEGACY_CONFIGS_KEY);
            return;
        }

        let order = 0;

        for (const [modId, state] of Object.entries(legacyStates)) {
            const template = this._templates[modId];
            if (!template) continue;

            const legacyConfig = legacyConfigs[modId] || {};
            const defaults = template.defaultInstances || [{ config: {} }];

            for (const def of defaults) {
                const config = { ...def.config };

                // Carry over provider setting from v2 to all instances of this template
                if (legacyConfig.provider) {
                    config.provider = legacyConfig.provider;
                }

                const instance = {
                    instanceId: 'i_' + modId + '_' + (Date.now() + order),
                    templateId: modId,
                    order: order++,
                    config
                };

                // Merge any schema defaults
                for (const field of (template.configSchema || [])) {
                    if (field.default !== undefined && instance.config[field.key] === undefined) {
                        instance.config[field.key] = field.default;
                    }
                }

                this._instances.push(instance);
                this._serverStatuses[instance.instanceId] = 'unknown';
            }
        }

        this._persistInstances();

        // Clean up legacy keys
        localStorage.removeItem(LEGACY_STATES_KEY);
        localStorage.removeItem(LEGACY_CONFIGS_KEY);

        console.info('[mod-state] Migrated v2 MOD states/configs to v3 instances');
    },

    /**
     * Migrate v1 localStorage (8 translate-* MODs) to v2 format.
     * This modifies legacyStates/legacyConfigs in localStorage, which
     * will then be picked up by migrateV2ToV3.
     */
    _migrateV1ToV2() {
        let states;
        try {
            states = JSON.parse(localStorage.getItem(LEGACY_STATES_KEY) || '{}');
        } catch {
            return;
        }

        const hasV1 = V1_TRANSLATE_IDS.some(id => states[id] !== undefined);
        if (!hasV1) return;

        let configs;
        try {
            configs = JSON.parse(localStorage.getItem(LEGACY_CONFIGS_KEY) || '{}');
        } catch {
            configs = {};
        }

        const anyOnlineEnabled = V1_TRANSLATE_IDS
            .filter(id => id.endsWith('-online'))
            .some(id => states[id]?.enabled);
        const anyOfflineEnabled = V1_TRANSLATE_IDS
            .filter(id => id.endsWith('-offline'))
            .some(id => states[id]?.enabled);

        if (!states['translate']) {
            states['translate'] = {
                enabled: anyOnlineEnabled || anyOfflineEnabled,
                serverStatus: 'unknown'
            };
        }
        if (!configs['translate']) {
            configs['translate'] = {};
        }
        configs['translate'].provider = 'google';

        for (const id of V1_TRANSLATE_IDS) {
            delete states[id];
            delete configs[id];
        }

        localStorage.setItem(LEGACY_STATES_KEY, JSON.stringify(states));
        localStorage.setItem(LEGACY_CONFIGS_KEY, JSON.stringify(configs));
        console.info('[mod-state] Migrated v1 translate MODs to v2');
    },

    // ===================== Internal =====================

    _updateInstanceServerStatus(instance) {
        const template = this._templates[instance.templateId];
        if (!template) return;

        const providerKey = this._resolveProvider(instance);
        const provider = template.providers?.find(p => p.id === providerKey);
        if (!provider || provider.type === 'client' || provider.type === 'cloud') {
            this._serverStatuses[instance.instanceId] = 'online';
        }
    },

    _persistInstances() {
        try {
            localStorage.setItem(INSTANCES_KEY, JSON.stringify(this._instances));
        } catch (e) {
            console.error('[mod-state] Failed to persist instances:', e);
        }
    },

    _persistSharedConfig() {
        try {
            localStorage.setItem(SHARED_CONFIG_KEY, JSON.stringify(this._sharedConfig));
        } catch (e) {
            console.error('[mod-state] Failed to persist shared config:', e);
        }
    }
};
