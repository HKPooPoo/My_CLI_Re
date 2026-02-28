/**
 * LLM — Code module (data in manifest.json)
 * Generic textarea LLM processing.
 * Reads the focused textarea on any page. Simple prompt -> response.
 */

import { ModState } from '../../javascript/mod-state.js';
import {
    ensureOutputEl, initShelf, activateShelfPrompt, runLlm,
    runLlmWithImages, blobToBase64, renderPdfToImages,
    checkHealth, getInfoValue, onAction,
    getInstanceName, getIconUrl,
    migrateToSharedConfig, initPrewarm, onSharedConfigChange,
} from './_shared.js';

export default {
    getButtonDataId(config) {
        return 'llm-' + (config.icon || 'summarize');
    },

    getInstanceName(config, tFn) {
        return getInstanceName(config, tFn, 'mods.llm.name');
    },

    getIconUrl(config) {
        return getIconUrl(config);
    },

    _outputEl: null,

    async init(ctx) {
        _migrateOldConfig();
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
        const prompt = ctx.config.prompt;

        if (!prompt) { out.value = tFn('mods.llm.noPrompt'); return; }

        try {
            if (ctx.config.target === 'file') {
                await _activateFile(ctx, prompt, out, tFn);
            } else {
                const inputText = ctx.board.getText().trim();
                if (!inputText) { out.value = tFn('mods.llm.empty'); return; }
                await runLlm(ctx.config, prompt, inputText, out, tFn);
            }
        } catch (e) {
            console.error('[llm] activate error:', e);
            out.value = tFn('mods.llm.error', { error: e.message || String(e) });
        }
    },

    async deactivate() {},
    destroy() {},
    checkHealth,
    getInfoValue,
    onAction,
    onSharedConfigChange,
};

// ===================== Migration =====================

/**
 * Migrate old config format (task-based) to new format (prompt/icon).
 * Runs once at init — checks all LLM instances for old `task` key.
 */
function _migrateOldConfig() {
    const instances = ModState.getInstancesByTemplate('llm');
    for (const inst of instances) {
        const config = inst.config;
        if (!config.task) continue;

        const task = config.task;
        let prompt = config.systemPrompt || '';
        let icon = 'summarize';

        const LANG_NAMES = { 'zh-TW': '\u7E41\u9AD4\u4E2D\u6587', 'zh-CN': '\u7B80\u4F53\u4E2D\u6587', 'en': 'English', 'ja': '\u65E5\u672C\u8A9E' };

        switch (task) {
            case 'translate': {
                const lang = LANG_NAMES[config.targetLang] || config.targetLang || '\u7E41\u9AD4\u4E2D\u6587';
                if (!prompt) prompt = `Translate to ${lang}.`;
                icon = 'translate';
                break;
            }
            case 'summarize':
                if (!prompt) prompt = 'Summarize concisely. Output plain text only.';
                break;
            case 'polish':
                if (!prompt) prompt = 'Improve grammar and style. Keep the original meaning. Output only the improved text.';
                icon = 'polish';
                break;
            case 'summarize-files':
                if (!prompt) prompt = 'Summarize the text and file contents. Output plain text only.';
                icon = 'summarize-files';
                break;
            case 'summarize-branch':
                if (!prompt) prompt = 'Summarize these entries. Identify key themes. Output plain text only.';
                icon = 'summarize-branch';
                break;
            case 'summarize-all':
                if (!prompt) prompt = 'Summarize across all branches. Identify patterns. Output plain text only.';
                icon = 'summarize-all';
                break;
            default:
                if (!prompt) prompt = 'Summarize concisely. Output plain text only.';
                break;
        }

        ModState.setConfig(inst.instanceId, 'prompt', prompt);
        ModState.setConfig(inst.instanceId, 'icon', icon);
        console.log(`[llm] migrated instance ${inst.instanceId}: task="${task}" \u2192 prompt/icon`);
    }
}

// ===================== File Target =====================

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

async function _activateFile(ctx, prompt, out, tFn) {
    // Vision requires Ollama qwen3-vl — other providers lack image support.
    // Extending to apikey would need a different message schema (OpenAI content array).
    const provider = ctx.config.provider || 'client';
    if (provider !== 'server') {
        out.value = tFn('mods.llm.fileServerOnly');
        return;
    }

    const attachments = ctx.board.getAttachmentsWithMeta();
    if (!attachments.length) {
        out.value = tFn('mods.llm.noFiles');
        return;
    }

    out.value = tFn('mods.llm.processingFiles');
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
                // Non-image, non-PDF: read as text and prepend to prompt
                const text = await blob.text();
                if (text.trim()) {
                    enrichedPrompt += `\n\n--- File: ${att.name || att.hash} ---\n${text}`;
                }
            }
        }

        if (images.length > 0) {
            // runLlmWithImages manages its own loading state
            delete out.dataset.loading;
            await runLlmWithImages(ctx.config, enrichedPrompt, images, out, tFn);
        } else if (enrichedPrompt !== prompt) {
            // All files were text — use regular text path with enriched prompt
            delete out.dataset.loading;
            await runLlm(ctx.config, enrichedPrompt, '', out, tFn);
        } else {
            out.value = tFn('mods.llm.noFiles');
        }
    } finally {
        delete out.dataset.loading;
    }
}

