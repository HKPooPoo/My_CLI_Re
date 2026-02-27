/**
 * LLM BC — Code module (data in manifest.json)
 * Broadcast-scoped LLM processing.
 * Processes channel text or full channel history.
 */

import {
    getContextLimits, formatRecords,
    ensureOutputEl, initShelf, activateShelfPrompt, runLlm,
    checkHealth, getInfoValue, onAction,
    getInstanceName, getIconUrl,
} from '../llm/_shared.js';

// ===================== Runtime Constants =====================

const TARGETS = {
    'text':    { page: 'broadcast-channel', scope: 'text' },
    'history': { page: 'broadcast-channel', scope: 'history' },
};

// ===================== Template =====================

export default {
    getButtonDataId(config) {
        return 'llm-' + (config.icon || 'summarize');
    },

    getInstanceName(config, tFn) {
        return getInstanceName(config, tFn, 'mods.llmBc.name');
    },

    getIconUrl(config) {
        return getIconUrl(config);
    },

    getDeployPages(config) {
        const target = TARGETS[config.target || 'text'];
        return target ? [target.page] : ['broadcast-channel'];
    },

    _outputEl: null,

    async init(ctx) {
        initShelf(this, ctx);
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
        out.value = tFn('mods.llm.processing');

        try {
            const targetDef = TARGETS[config.target] || TARGETS['text'];
            const provider = config.provider || 'client';
            const limits = getContextLimits(provider);
            const inputText = await _collectInput(ctx, targetDef.scope, limits);

            if (!inputText) { out.value = tFn('mods.llm.empty'); return; }
            await runLlm(config, prompt, inputText, out, tFn);
        } catch (e) {
            console.error('[llm-bc] activate error:', e);
            out.value = tFn('mods.llm.error', { error: e.message || String(e) });
        }
    },

    async deactivate() {},
    destroy() {},
    checkHealth,
    getInfoValue,
    onAction,
};

// ===================== Private =====================

async function _collectInput(ctx, scope, limits) {
    if (scope === 'text') {
        return ctx.board.getText().trim();
    }

    if (scope === 'history') {
        const records = await ctx.board.getAllRecords();
        if (!records || records.length === 0) return '';
        const channelName = ctx.board.getBranchName() || 'channel';
        const { text, truncated } = formatRecords(records, limits.branch);
        if (!text) return '';
        const suffix = truncated ? `\n\n[... ${truncated} more entries truncated]` : '';
        return `Channel: ${channelName}\n\n${text}${suffix}`;
    }

    return '';
}
