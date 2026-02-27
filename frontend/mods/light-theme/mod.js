/**
 * Light Theme MOD — Code module (data in manifest.json)
 */

export default {
    getButtonDataId(_config) {
        return 'light-theme';
    },

    getInstanceName(_config, tFn) {
        return tFn('mods.lightTheme.name');
    },

    getDeployPages(_config) {
        return [];
    },

    // --- Theme Contract ---

    getThemeVars(_config) {
        return {};
    },

    getThemeClasses(_config) {
        return ['theme-light'];
    },

    // --- Lifecycle ---

    async init(_ctx) {
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
};
