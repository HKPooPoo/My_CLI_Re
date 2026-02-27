/**
 * Translate MOD Template - Multi-language translation with provider selection
 * =================================================================
 * Instance-based: each instance targets a specific language.
 * Provider is selected via instance config (google / libretranslate).
 * Page-aware: reads from the active page's textarea via ModContext.
 *
 * v2.0.0: Uses ModContext API (ctx.board.*, ctx.instance.*, ctx.i18n.*)
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

    // --- Metadata (v2) ---
    version: '2.0.0',

    // --- Instance architecture ---
    // maxInstances: 0 = unlimited (default when omitted)

    getButtonDataId(config) {
        return 'translate-' + (config.targetLang || 'zh-TW');
    },

    getInstanceName(config, tFn) {
        const lang = (config.targetLang || 'zh-TW').replace(/-/g, '');  // zh-TW → zhTW
        return tFn('mods.translate.name') + ' \u2192 ' + tFn('mods.translate.lang.' + lang);
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
          healthEndpoint: '/mods/offline-translate/health' },
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
    // --- LLM Tools (v2) ---
    tools: [
        {
            name: 'translate_text',
            description: 'Translate text to a target language',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Text to translate' },
                    targetLang: { type: 'string', description: 'Target language code (zh-TW, zh-CN, en, ja)', enum: ['zh-TW', 'zh-CN', 'en', 'ja'] },
                    provider: { type: 'string', description: 'Translation provider', enum: ['google', 'libretranslate'] },
                },
                required: ['text', 'targetLang']
            },
            async execute(args) {
                const payload = { text: args.text, target: args.targetLang };
                if (args.provider === 'libretranslate') {
                    payload.provider = 'libretranslate';
                }
                const data = await TranslationService.translate(payload);
                return { translatedText: data.data?.translations?.[0]?.translatedText };
            }
        }
    ],

    // --- Internal state ---
    _outputEl: null,

    // --- Lifecycle ---
    async init(ctx) {
        const shelf = ctx.ui.getShelfElement();
        if (shelf) {
            const output = document.createElement('textarea');
            output.id = 'feature-translator-output';
            output.className = 'mod-shelf-output';
            output.readOnly = true;
            shelf.appendChild(output);
            this._outputEl = output;
        }
    },

    async activate(ctx) {
        if (!ctx) return;

        const targetLang = ctx.config.targetLang || ctx.buttonId?.replace('translate-', '') || 'zh-TW';
        const t = ctx.i18n.t;

        const text = ctx.board.getText().trim();
        if (!text) {
            if (this._outputEl) this._outputEl.value = t('mods.translate.bufferEmpty');
            return;
        }

        if (this._outputEl) {
            this._outputEl.value = t('mods.translate.decrypting');
            this._outputEl.dataset.loading = 'true';
        }

        try {
            const provider = ctx.instance.getConfig('provider') || 'google';
            const payload = { text, target: targetLang };
            if (provider === 'libretranslate') {
                payload.provider = 'libretranslate';
            }

            const data = await TranslationService.translate(payload);
            const translation = data.data?.translations?.[0]?.translatedText;
            if (this._outputEl) {
                this._outputEl.value = translation || t('mods.translate.nullResult');
            }
        } catch (e) {
            console.error("Translation Error:", e);
            if (this._outputEl) {
                this._outputEl.value = t('mods.translate.criticalBreach', { error: e.message.toUpperCase() });
            }
        } finally {
            if (this._outputEl) delete this._outputEl.dataset.loading;
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
};
