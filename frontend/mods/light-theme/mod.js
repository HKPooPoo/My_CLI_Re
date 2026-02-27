/**
 * Light Theme MOD — Self-contained light/white theme
 * =================================================================
 * Switches the CRT dark default to a clean light appearance.
 * ALL theme CSS overrides live in this MOD's own theme.css file,
 * NOT in the framework CSS. The MOD loads its CSS in init().
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
     * Returns empty — all overrides are in theme.css loaded by init().
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

    // ===================== Lifecycle =====================
    async init(_ctx) {
        // Load self-contained theme CSS (skip if anti-FOUC already loaded it)
        if (!document.getElementById('light-theme-css')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.id = 'light-theme-css';
            link.href = '/mods/light-theme/theme.css';
            document.head.appendChild(link);
        }
    },
    async activate(_ctx) {},
    async deactivate(_ctx) {},
    onConfigChange(_ctx, _key, _value) {},
    async checkHealth(_instanceConfig) { return 'online'; },
    destroy(_ctx) {},

    // ===================== Tools / Hooks =====================
    tools: [],
    hooks: [],
};
