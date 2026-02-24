/**
 * Translate MOD - Multi-language translation with provider selection
 * =================================================================
 * Collapses the old 8 atomic MODs (4 online + 4 offline) into 1.
 * Provider is selected via config (google / libretranslate).
 * Page-aware: reads from the active page's textarea.
 * =================================================================
 */

import { TranslationService } from '../../javascript/services/translation-service.js';
import { ModState } from '../../javascript/mod-state.js';
import { playAudio } from '../../javascript/audio.js';
import { t } from '../../javascript/i18n.js';

const TRANSLATE_BTN_PREFIX = 'translate-';

export default {
    // --- Identity ---
    id: 'translate',
    group: 'linguistics',
    nameKey: 'mods.translate.name',
    descriptionKey: 'mods.translate.desc',
    defaultEnabled: true,

    // --- Feature integration ---
    featureButtons: [
        { id: 'translate-zh-TW', labelKey: 'mods.translate.btn.zhTW' },
        { id: 'translate-zh-CN', labelKey: 'mods.translate.btn.zhCN' },
        { id: 'translate-en', labelKey: 'mods.translate.btn.en' },
        { id: 'translate-ja', labelKey: 'mods.translate.btn.ja' },
    ],
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
        // Find or create shelf panel and inject translator UI
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
        // Called when a translate button is clicked
        if (!ctx?.buttonId) return;

        const targetLang = ctx.buttonId.replace(TRANSLATE_BTN_PREFIX, '');
        const inputEl = this._getActiveTextarea();

        if (!inputEl || !this._outputEl) return;

        const text = inputEl.value.trim();
        if (!text) {
            this._outputEl.value = t('mods.translate.bufferEmpty');
            return;
        }

        this._outputEl.value = t('mods.translate.decrypting');

        try {
            const translation = await this._translateText(text, targetLang);
            this._outputEl.value = translation || t('mods.translate.nullResult');
        } catch (e) {
            console.error("Translation Error:", e);
            this._outputEl.value = t('mods.translate.criticalBreach', { error: e.message.toUpperCase() });
        }
    },

    async deactivate() {},

    async checkHealth() {
        const provider = ModState.getConfig('translate', 'provider');
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

    getInfoValue(key) {
        if (key === 'libreStatus') {
            const status = ModState.getServerStatus('translate');
            return t(`mods.status.${status}`);
        }
        return '—';
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

    async _translateText(text, targetLang) {
        const payload = { text, target: targetLang };

        const provider = ModState.getConfig('translate', 'provider');
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
