/**
 * MOD Registry - Definitions for all available MODs
 * =================================================================
 * Each MOD = one atomic feature. Same feature button can be
 * referenced by multiple MODs (e.g. translate-zh-TW online + offline).
 * Button is visible if ANY referencing MOD is enabled.
 * =================================================================
 */

export const MOD_TYPES = { SERVER: 'server', CLIENT: 'client' };

export const MOD_REGISTRY = {
    // --- TRANSLATION: Online (Google Cloud API) ---
    'translate-zh-TW-online': {
        id: 'translate-zh-TW-online',
        nameKey: 'mods.translateZhTwOnline.name',
        descriptionKey: 'mods.translateZhTwOnline.desc',
        group: 'linguistics',
        type: MOD_TYPES.CLIENT,
        featureButtons: ['translate-zh-TW'],
        provider: 'google',
        config: [],
        defaultEnabled: true
    },
    'translate-zh-CN-online': {
        id: 'translate-zh-CN-online',
        nameKey: 'mods.translateZhCnOnline.name',
        descriptionKey: 'mods.translateZhCnOnline.desc',
        group: 'linguistics',
        type: MOD_TYPES.CLIENT,
        featureButtons: ['translate-zh-CN'],
        provider: 'google',
        config: [],
        defaultEnabled: true
    },
    'translate-en-online': {
        id: 'translate-en-online',
        nameKey: 'mods.translateEnOnline.name',
        descriptionKey: 'mods.translateEnOnline.desc',
        group: 'linguistics',
        type: MOD_TYPES.CLIENT,
        featureButtons: ['translate-en'],
        provider: 'google',
        config: [],
        defaultEnabled: true
    },
    'translate-ja-online': {
        id: 'translate-ja-online',
        nameKey: 'mods.translateJaOnline.name',
        descriptionKey: 'mods.translateJaOnline.desc',
        group: 'linguistics',
        type: MOD_TYPES.CLIENT,
        featureButtons: ['translate-ja'],
        provider: 'google',
        config: [],
        defaultEnabled: true
    },

    // --- TRANSLATION: Offline (LibreTranslate Docker) ---
    'translate-zh-TW-offline': {
        id: 'translate-zh-TW-offline',
        nameKey: 'mods.translateZhTwOffline.name',
        descriptionKey: 'mods.translateZhTwOffline.desc',
        group: 'linguistics',
        type: MOD_TYPES.SERVER,
        featureButtons: ['translate-zh-TW'],
        provider: 'libretranslate',
        healthEndpoint: '/api/mods/offline-translate/health',
        config: [],
        defaultEnabled: false
    },
    'translate-zh-CN-offline': {
        id: 'translate-zh-CN-offline',
        nameKey: 'mods.translateZhCnOffline.name',
        descriptionKey: 'mods.translateZhCnOffline.desc',
        group: 'linguistics',
        type: MOD_TYPES.SERVER,
        featureButtons: ['translate-zh-CN'],
        provider: 'libretranslate',
        healthEndpoint: '/api/mods/offline-translate/health',
        config: [],
        defaultEnabled: false
    },
    'translate-en-offline': {
        id: 'translate-en-offline',
        nameKey: 'mods.translateEnOffline.name',
        descriptionKey: 'mods.translateEnOffline.desc',
        group: 'linguistics',
        type: MOD_TYPES.SERVER,
        featureButtons: ['translate-en'],
        provider: 'libretranslate',
        healthEndpoint: '/api/mods/offline-translate/health',
        config: [],
        defaultEnabled: false
    },
    'translate-ja-offline': {
        id: 'translate-ja-offline',
        nameKey: 'mods.translateJaOffline.name',
        descriptionKey: 'mods.translateJaOffline.desc',
        group: 'linguistics',
        type: MOD_TYPES.SERVER,
        featureButtons: ['translate-ja'],
        provider: 'libretranslate',
        healthEndpoint: '/api/mods/offline-translate/health',
        config: [],
        defaultEnabled: false
    },

    // --- LINGUISTICS: Speech ---
    'speech-to-text': {
        id: 'speech-to-text',
        nameKey: 'mods.speechToText.name',
        descriptionKey: 'mods.speechToText.desc',
        group: 'linguistics',
        type: MOD_TYPES.CLIENT,
        featureButtons: ['voice-to-textbox'],
        config: [],
        defaultEnabled: true
    },

    // --- UTILITIES ---
    'markdown-preview': {
        id: 'markdown-preview',
        nameKey: 'mods.markdownPreview.name',
        descriptionKey: 'mods.markdownPreview.desc',
        group: 'utilities',
        type: MOD_TYPES.CLIENT,
        featureButtons: ['markdown-preview'],
        config: [],
        defaultEnabled: true
    }
};
