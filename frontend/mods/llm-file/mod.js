/**
 * LLM FILE — Code module (data in manifest.json)
 * AI file processing: OCR, image description, and document analysis via vision model.
 * Reads attachments on the current record. Server-only (Ollama qwen3.5).
 */

import {
    ensureOutputEl, initShelf, activateShelfPrompt,
    runLlm, runLlmWithImages, blobToBase64, renderPdfToImages,
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
        if (!ctx) return;
        const out = ensureOutputEl(this);
        if (!out) return;
        activateShelfPrompt(ctx);

        const tFn = ctx.i18n.t;
        const config = ctx.config;
        const prompt = config.prompt;
        if (!prompt) { out.value = tFn('mods.llm.noPrompt'); return; }

        const provider = config.provider || 'server';
        if (provider !== 'server') {
            out.value = tFn('mods.llmFile.serverOnly');
            return;
        }

        const attachments = ctx.board.getAttachmentsWithMeta();
        if (!attachments.length) {
            out.value = tFn('mods.llmFile.noFiles');
            return;
        }

        out.value = tFn('mods.llmFile.processing');
        out.dataset.loading = 'true';

        try {
            const images = [];
            let enrichedPrompt = prompt;

            for (const att of attachments) {
                const blob = await ctx.file.readContent(att.hash);
                const mime = att.mime || blob.type || '';

                if (IMAGE_MIMES.has(mime)) {
                    images.push(await blobToBase64(blob));
                } else if (mime === 'application/pdf') {
                    const pdfImages = await renderPdfToImages(blob);
                    images.push(...pdfImages);
                } else {
                    const text = await blob.text();
                    if (text.trim()) {
                        enrichedPrompt += `\n\n--- File: ${att.name || att.hash} ---\n${text}`;
                    }
                }
            }

            if (images.length > 0) {
                delete out.dataset.loading;
                await runLlmWithImages(config, enrichedPrompt, images, out, tFn);
            } else if (enrichedPrompt !== prompt) {
                delete out.dataset.loading;
                await runLlm(config, enrichedPrompt, '', out, tFn);
            } else {
                out.value = tFn('mods.llmFile.noFiles');
            }
        } catch (e) {
            console.error('[llm-file] activate error:', e);
            out.value = tFn('mods.llm.error', { error: e.message || String(e) });
        } finally {
            delete out.dataset.loading;
        }
    },

    async deactivate() {},
    destroy() {},
    checkHealth,
    getInfoValue,
    onAction,
    onSharedConfigChange,
};
