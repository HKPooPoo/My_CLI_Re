/**
 * LLM BB — Blackboard-scoped LLM processing.
 * Processes branch records and cross-branch analysis.
 */

import {
    ICONS, PROVIDERS, PROVIDER_CONFIG_SCHEMA,
    getContextLimits, formatRecords,
    ensureOutputEl, initShelf, activateShelfPrompt, runLlm,
    checkHealth, getInfoValue, onAction,
    getInstanceName, getIconUrl,
} from '../llm/_shared.js';

// ===================== Constants =====================

const TARGETS = {
    'branch-log':      { page: 'blackboard-log',    scope: 'branch',  labelKey: 'mods.llmBb.target.branchLog' },
    'branch-overview': { page: 'blackboard-branch',  scope: 'branch',  labelKey: 'mods.llmBb.target.branchOverview' },
    'all':             { page: 'blackboard-branch',  scope: 'all',     labelKey: 'mods.llmBb.target.all' },
};

const TARGET_PRESETS = {
    'branch-log': [
        { labelKey: 'mods.llm.preset.branchSummary',  value: 'Summarize the key themes across these entries.' },
        { labelKey: 'mods.llm.preset.branchTimeline',  value: 'Describe how the topics evolved over time.' },
        { labelKey: 'mods.llm.preset.branchExtract',   value: 'Extract the most important points from each entry.' },
    ],
    'branch-overview': [
        { labelKey: 'mods.llm.preset.branchSummary',  value: 'Summarize the key themes across these entries.' },
        { labelKey: 'mods.llm.preset.branchTimeline',  value: 'Describe how the topics evolved over time.' },
        { labelKey: 'mods.llm.preset.branchExtract',   value: 'Extract the most important points from each entry.' },
    ],
    'all': [
        { labelKey: 'mods.llm.preset.allOverview', value: 'Summarize each branch and identify common themes.' },
        { labelKey: 'mods.llm.preset.allCompare',  value: 'Compare the branches. What are the key differences?' },
    ],
};

// ===================== Template =====================

export default {
    id: 'llm-bb',
    group: 'llm',
    nameKey: 'mods.llmBb.name',
    descriptionKey: 'mods.llmBb.desc',
    version: '1.0.0',
    minApiVersion: 1,
    shelfPanelId: 'llm',

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
        const target = TARGETS[config.target];
        return target ? [target.page] : [];
    },

    defaultInstances: [
        { config: { prompt: 'Summarize the key themes across these entries.', icon: 'summarize-branch', target: 'branch-log', provider: 'client' } },
    ],

    pages: {
        'blackboard-log':    { textareaSelector: '#log-textarea' },
        'blackboard-branch': {},
    },

    providers: PROVIDERS,

    configSchema: [
        { key: 'target', type: 'select', labelKey: 'mods.llmBb.config.target', default: 'branch-log',
          options: Object.entries(TARGETS).map(([v, t]) => ({ value: v, labelKey: t.labelKey })) },
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'branch-log' },      presets: TARGET_PRESETS['branch-log'] },
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'branch-overview' },  presets: TARGET_PRESETS['branch-overview'] },
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'all' },              presets: TARGET_PRESETS['all'] },
        { key: 'icon', type: 'icon-picker', labelKey: 'mods.llm.config.icon', default: 'summarize-branch',
          icons: ICONS },
        ...PROVIDER_CONFIG_SCHEMA,
    ],

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
