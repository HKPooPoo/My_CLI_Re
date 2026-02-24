/**
 * MOD Registry - Definitions for all available MODs
 * =================================================================
 * Each MOD entry defines its metadata, type, and integration points.
 * =================================================================
 */

export const MOD_TYPES = { SERVER: 'server', CLIENT: 'client' };

export const MOD_REGISTRY = {
    'markdown-preview': {
        id: 'markdown-preview',
        nameKey: 'mods.markdownPreview.name',
        descriptionKey: 'mods.markdownPreview.desc',
        type: MOD_TYPES.CLIENT,
        featureButtons: ['markdown-preview'],
        defaultEnabled: false
    },
    'offline-translate': {
        id: 'offline-translate',
        nameKey: 'mods.offlineTranslate.name',
        descriptionKey: 'mods.offlineTranslate.desc',
        type: MOD_TYPES.SERVER,
        healthEndpoint: '/api/mods/offline-translate/health',
        replaces: 'google-translate',
        featureButtons: ['translate-zh-TW', 'translate-zh-CN', 'translate-en', 'translate-ja'],
        defaultEnabled: false
    }
};
