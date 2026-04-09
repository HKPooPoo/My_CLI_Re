/**
 * LLM BC — Code module (data in manifest.json)
 * Broadcast-scoped LLM processing.
 * Processes channel text or full channel history.
 */

import {
    getContextLimits, formatRecords,
    initShelf, runActivation,
    checkHealth, getInfoValue, onAction,
    getInstanceName, getIconUrl,
    migrateToSharedConfig, initPrewarm, onSharedConfigChange,
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
        migrateToSharedConfig();
        initShelf(this, ctx);
        initPrewarm();
    },

    async activate(ctx) {
        await runActivation(this, ctx, async (c) => {
            const targetDef = TARGETS[c.config.target] || TARGETS['text'];
            const limits = getContextLimits(c.config.provider || 'client');
            const text = await _collectInput(c, targetDef.scope, limits);
            return text ? { text } : null;
        });
    },

    async deactivate() {},
    destroy() {},
    checkHealth,
    getInfoValue,
    onAction,
    onSharedConfigChange,
};

// ===================== Private =====================

async function _collectInput(ctx, scope, limits) {
    if (scope === 'text') {
        const selection = ctx.board.getSelection().text.trim();
        return selection || ctx.board.getText().trim();
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
