/**
 * LLM BB — Code module (data in manifest.json)
 * Blackboard-scoped LLM processing.
 * Processes branch records and cross-branch analysis.
 */

import {
    getContextLimits, formatRecords,
    ensureOutputEl, initShelf, activateShelfPrompt, runLlm,
    checkHealth, getInfoValue, onAction,
    getInstanceName, getIconUrl,
} from '../llm/_shared.js';

// ===================== Runtime Constants =====================

const TARGETS = {
    'branch-log':      { page: 'blackboard-log',    scope: 'branch' },
    'branch-overview': { page: 'blackboard-branch',  scope: 'branch' },
    'all':             { page: 'blackboard-branch',  scope: 'all' },
};

// ===================== Template =====================

export default {
    getButtonDataId(config) {
        return 'llm-' + (config.icon || 'summarize-branch');
    },

    getInstanceName(config, tFn) {
        return getInstanceName(config, tFn, 'mods.llmBb.name');
    },

    getIconUrl(config) {
        return getIconUrl(config);
    },

    getDeployPages(config) {
        const target = TARGETS[config.target || 'branch-log'];
        return target ? [target.page] : [];
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
            const targetDef = TARGETS[config.target] || TARGETS['branch-log'];
            const provider = config.provider || 'client';
            const limits = getContextLimits(provider);
            const inputText = await _collectInput(ctx, targetDef.scope, limits);

            if (!inputText) { out.value = tFn('mods.llm.empty'); return; }
            await runLlm(config, prompt, inputText, out, tFn);
        } catch (e) {
            console.error('[llm-bb] activate error:', e);
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
    if (scope === 'branch') {
        const records = await ctx.board.getAllRecords();
        if (!records || records.length === 0) return '';
        const branchName = ctx.board.getBranchName() || ctx.board.getBranchId() || 'unnamed';
        const { text, truncated } = formatRecords(records, limits.branch);
        if (!text) return '';
        const suffix = truncated ? `\n\n[... ${truncated} more entries truncated]` : '';
        return `Branch: ${branchName}\n\n${text}${suffix}`;
    }

    if (scope === 'all') {
        const branches = await ctx.board.getAllBranches();
        if (!branches || branches.length === 0) return '';
        const sections = [];
        let totalChars = 0;

        for (const branch of branches) {
            const name = branch.name || branch.id;
            const records = await ctx.board.getAllRecordsForBranch(branch.id);
            const perBranchLimit = Math.floor(limits.all / branches.length);
            const { text, truncated } = formatRecords(records, perBranchLimit);
            if (!text) continue;
            let section = `=== ${name} ===\n\n${text}`;
            if (truncated) section += `\n\n[... ${truncated} more entries truncated]`;
            if (totalChars + section.length > limits.all) break;
            sections.push(section);
            totalChars += section.length;
        }

        if (sections.length === 0) return '';
        return sections.join('\n\n');
    }

    return '';
}
