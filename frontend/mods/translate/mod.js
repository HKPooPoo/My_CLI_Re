/**
 * Translate MOD Template - Multi-language translation with provider selection
 * =================================================================
 * Instance-based: each instance targets a specific language.
 * Provider is selected via instance config (google / libretranslate).
 * Page-aware: reads from the active page's textarea.
 * =================================================================
 */

import { TranslationService } from '../../javascript/services/translation-service.js';
import { ModState } from '../../javascript/mod-state.js';
import { t } from '../../javascript/i18n.js';

export default {
    // --- Identity ---
    id: 'translate',
    group: 'linguistics',
    nameKey: 'mods.translate.name',
    descriptionKey: 'mods.translate.desc',

    // --- Instance architecture ---
    singleton: false,

    getButtonDataId(config) {
        return 'translate-' + (config.targetLang || 'zh-TW');
    },

    getInstanceName(config, tFn) {
        const lang = (config.targetLang || 'zh-TW').replace(/-/g, '');  // zh-TW → zhTW
        return (tFn || t)('mods.translate.name') + ' \u2192 ' + (tFn || t)('mods.translate.lang.' + lang);
    },

    defaultInstances: [
        { config: { targetLang: 'zh-TW', provider: 'google' } },
        { config: { targetLang: 'zh-CN', provider: 'google' } },
        { config: { targetLang: 'en',    provider: 'google' } },
        { config: { targetLang: 'ja',    provider: 'google' } },
    ],

    // --- Feature integration ---
    shelfPanelId: 'translator',

    // --- Page awareness ---
    pages: {
        'blackboard-log':    { textareaSelector: '#log-textarea' },
        'broadcast-channel': { textareaSelector: '#channel-textarea' },
    },

    // --- Provider & Config ---
    providers: [
        { id: 'google', type: 'cloud', nameKey: 'mods.translate.provider.google' },
        { id: 'libretranslate', type: 'server', nameKey: 'mods.translate.provider.libre',
          healthEndpoint: '/api/mods/offline-translate/health' },
    ],
    configSchema: [
        {
            key: 'targetLang',
            type: 'select',
            labelKey: 'mods.translate.config.targetLang',
            options: [
                { value: 'zh-TW', labelKey: 'mods.translate.lang.zhTW' },
                { value: 'zh-CN', labelKey: 'mods.translate.lang.zhCN' },
                { value: 'en',    labelKey: 'mods.translate.lang.en' },
                { value: 'ja',    labelKey: 'mods.translate.lang.ja' },
            ],
            default: 'zh-TW'
        },
        {
            key: 'provider',
            type: 'select',
            labelKey: 'mods.translate.config.provider',
            options: [
                { value: 'google', labelKey: 'mods.translate.provider.google' },
                { value: 'libretranslate', labelKey: 'mods.translate.provider.libre' },
            ],
            default: 'google'
        },
        {
            key: 'libreStatus',
            type: 'info',
            labelKey: 'mods.translate.config.libreStatus',
            showWhen: { key: 'provider', value: 'libretranslate' }
        },
    ],
    sharedConfigGroup: null,

    // --- Internal state ---
    _outputEl: null,

    // --- Lifecycle ---
    async init(ctx) {
        const shelf = document.querySelector('[data-feature-shelf="translator"]');
        if (shelf) {
            const output = document.createElement('textarea');
            output.id = 'feature-translator-output';
            output.readOnly = true;
            shelf.appendChild(output);
            this._outputEl = output;
        }
    },

    async activate(ctx) {
        if (!ctx) return;

        // Instance-aware: read target language from instance config
        const targetLang = ctx.instanceConfig?.targetLang || ctx.buttonId?.replace('translate-', '') || 'zh-TW';
        const instanceId = ctx.instanceId;

        const inputEl = this._getActiveTextarea();
        if (!inputEl || !this._outputEl) return;

        const text = inputEl.value.trim();
        if (!text) {
            this._outputEl.value = t('mods.translate.bufferEmpty');
            return;
        }

        this._outputEl.value = t('mods.translate.decrypting');

        try {
            const translation = await this._translateText(text, targetLang, instanceId);
            this._outputEl.value = translation || t('mods.translate.nullResult');
        } catch (e) {
            console.error("Translation Error:", e);
            this._outputEl.value = t('mods.translate.criticalBreach', { error: e.message.toUpperCase() });
        }
    },

    async deactivate() {},

    async checkHealth(instanceConfig) {
        const provider = instanceConfig?.provider || 'google';
        if (provider === 'libretranslate') {
            const libre = this.providers.find(p => p.id === 'libretranslate');
            if (libre?.healthEndpoint) {
                try {
                    const { ModService } = await import('../../javascript/services/mod-service.js');
                    await ModService.checkHealth(libre.healthEndpoint);
                    return 'online';
                } catch {
                    return 'offline';
                }
            }
        }
        return 'online';
    },

    destroy() {},

    getInfoValue(key, instanceId) {
        if (key === 'libreStatus') {
            const status = instanceId
                ? ModState.getServerStatus(instanceId)
                : 'unknown';
            return t(`mods.status.${status}`);
        }
        return '\u2014';
    },

    // --- Private helpers ---

    _getActiveTextarea() {
        const activePage = document.querySelector('.page.active');
        if (!activePage) return null;
        const page = activePage.dataset.page;
        const pageDef = this.pages[page];
        if (!pageDef) return null;
        return document.querySelector(pageDef.textareaSelector);
    },

    async _translateText(text, targetLang, instanceId) {
        const payload = { text, target: targetLang };

        const provider = instanceId
            ? ModState.getConfig(instanceId, 'provider')
            : 'google';
        if (provider === 'libretranslate') {
            payload.provider = 'libretranslate';
        }

        try {
            const data = await TranslationService.translate(payload);
            return data.data?.translations?.[0]?.translatedText;
        } catch (error) {
            if (error.message) throw new Error(error.message);
            throw error;
        }
    }
};
