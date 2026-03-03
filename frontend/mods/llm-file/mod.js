/**
 * LLM FILE — Code module (data in manifest.json)
 * AI file processing: OCR, image description, and document analysis via vision model.
 * Reads attachments on the current record. Server-only (Ollama qwen3.5).
 */

import {
    initShelf, runActivation,
    blobToBase64, renderPdfToImages,
    checkHealth, getInfoValue, onAction,
    getInstanceName, getIconUrl,
    migrateToSharedConfig, initPrewarm, onSharedConfigChange,
} from '../llm/_shared.js';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export default {
    getButtonDataId(config) {
        return 'llm-' + (config.icon || 'ocr');
    },

    getInstanceName(config, tFn) {
        return getInstanceName(config, tFn, 'mods.llmFile.name');
    },

    getIconUrl(config) { return getIconUrl(config); },

    _outputEl: null,

    async init(ctx) {
        migrateToSharedConfig();
        initShelf(this, ctx);
        initPrewarm();
    },

    async activate(ctx) {
        await runActivation(this, ctx, async (c, prompt) => {
            if ((c.config.provider || 'server') !== 'server')
                return { error: c.i18n.t('mods.llmFile.serverOnly') };

            const attachments = c.board.getAttachmentsWithMeta();
            if (!attachments.length)
                return { error: c.i18n.t('mods.llmFile.noFiles') };

            const images = [];
            let enrichedPrompt = prompt;

            for (const att of attachments) {
                const blob = await c.file.readContent(att.hash);
                const mime = att.mime || blob.type || '';

                if (IMAGE_MIMES.has(mime)) {
                    images.push(await blobToBase64(blob));
                } else if (mime === 'application/pdf') {
                    images.push(...await renderPdfToImages(blob));
                } else {
                    const text = await blob.text();
                    if (text.trim()) {
                        enrichedPrompt += `\n\n--- File: ${att.name || att.hash} ---\n${text}`;
                    }
                }
            }

            if (images.length > 0) return { images, prompt: enrichedPrompt };
            if (enrichedPrompt !== prompt) return { text: '', prompt: enrichedPrompt };
            return { error: c.i18n.t('mods.llmFile.noFiles') };
        });
    },

    async deactivate() {},
    destroy() {},
    checkHealth,
    getInfoValue,
    onAction,
    onSharedConfigChange,
};
