/**
 * Light Theme MOD — Built-in light/white theme
 * =================================================================
 * Switches the CRT dark default to a clean light appearance.
 * All CSS overrides live in the existing :root.theme-light rules
 * across the stylesheet files — this MOD simply activates the class.
 *
 * Theme MOD contract:
 *   group: 'theme'
 *   getThemeVars(config)    → CSS custom property overrides
 *   getThemeClasses(config) → CSS classes to add to <html>
 * =================================================================
 */

export default {
    // ===================== Identity =====================
    id: 'light-theme',
    group: 'theme',
    nameKey: 'mods.lightTheme.name',
    descriptionKey: 'mods.lightTheme.desc',

    // ===================== Metadata =====================
    version: '1.0.0',
    minApiVersion: 1,
    author: '',

    // ===================== Instance Architecture =====================
    maxInstances: 1,

    getButtonDataId(_config) {
        return 'light-theme';
    },

    getInstanceName(_config, tFn) {
        return tFn('mods.lightTheme.name');
    },

    defaultInstances: [
        { config: {} },
    ],

    // ===================== Feature Integration =====================
    shelfPanelId: null,
    pages: {},

    getDeployPages(_config) {
        return [];
    },

    // ===================== Providers =====================
    providers: [],

    // ===================== Config Schema =====================
    configSchema: [],

    // ===================== Theme Contract =====================

    /**
     * CSS custom property overrides.
     * Returns empty — all overrides are handled by the :root.theme-light
     * CSS class rules already defined across the stylesheet files.
     */
    getThemeVars(_config) {
        return {};
    },

    /**
     * CSS classes to add to <html> when this theme is active.
     */
    getThemeClasses(_config) {
        return ['theme-light'];
    },

    // ===================== Lifecycle (no-ops) =====================
    async init(_ctx) {},
    async activate(_ctx) {},
    async deactivate(_ctx) {},
    onConfigChange(_ctx, _key, _value) {},
    async checkHealth(_instanceConfig) { return 'online'; },
    destroy(_ctx) {},

    // ===================== Tools / Hooks =====================
    tools: [],
    hooks: [],
};
