/**
 * Translate MOD — Code module (data in manifest.json)
 */

import { TranslationService } from '../../javascript/services/translation-service.js';

export default {
    getButtonDataId(config) {
        return 'translate-' + (config.targetLang || 'zh-TW');
    },

    getInstanceName(config, tFn) {
        const lang = (config.targetLang || 'zh-TW').replace(/-/g, '');  // zh-TW → zhTW
        return tFn('mods.translate.name') + ' \u2192 ' + tFn('mods.translate.lang.' + lang);
    },

    tools: [
        {
            name: 'translate_text',
            description: 'Translate text to a target language',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Text to translate' },
                    targetLang: { type: 'string', description: 'Target language code (zh-TW, zh-CN, en, ja)', enum: ['zh-TW', 'zh-CN', 'en', 'ja'] },
                },
                required: ['text', 'targetLang']
            },
            async execute(args) {
                const data = await TranslationService.translate({ text: args.text, target: args.targetLang });
                return { translatedText: data.data?.translations?.[0]?.translatedText };
            }
        }
    ],

    _outputEl: null,

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

        const selection = ctx.board.getSelection().text.trim();
        const text = selection || ctx.board.getText().trim();
        if (!text) {
            if (this._outputEl) this._outputEl.value = t('mods.translate.bufferEmpty');
            return;
        }

        if (this._outputEl) {
            this._outputEl.value = t('mods.translate.decrypting');
            this._outputEl.dataset.loading = 'true';
        }

        try {
            const data = await TranslationService.translate({ text, target: targetLang });
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
    destroy() {},
};
