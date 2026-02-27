/**
 * LLM BC — Broadcast-scoped LLM processing.
 * Processes channel text or full channel history.
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
    'text':    { page: 'broadcast-channel', scope: 'text',    labelKey: 'mods.llmBc.target.text' },
    'history': { page: 'broadcast-channel', scope: 'history', labelKey: 'mods.llmBc.target.history' },
};

const TARGET_PRESETS = {
    'text': [
        { labelKey: 'mods.llm.preset.summarize', value: 'Summarize concisely.' },
        { labelKey: 'mods.llm.preset.translate',  value: 'Translate to English.' },
        { labelKey: 'mods.llm.preset.explain',    value: 'Explain in simple terms.' },
    ],
    'history': [
        { labelKey: 'mods.llmBc.preset.channelSummary', value: 'Summarize the key themes in this channel.' },
        { labelKey: 'mods.llmBc.preset.channelExtract',  value: 'Extract the most important points from the messages.' },
    ],
};

// ===================== Template =====================

export default {
    id: 'llm-bc',
    group: 'llm',
    nameKey: 'mods.llmBc.name',
    descriptionKey: 'mods.llmBc.desc',
    version: '1.0.0',
    minApiVersion: 1,
    shelfPanelId: 'llm',

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
        return ['broadcast-channel'];
    },

    defaultInstances: [
        { config: { prompt: 'Summarize the key themes in this channel.', icon: 'summarize', target: 'history', provider: 'client' } },
    ],

    pages: {
        'broadcast-channel': { textareaSelector: '#channel-textarea' },
    },

    providers: PROVIDERS,

    configSchema: [
        { key: 'target', type: 'select', labelKey: 'mods.llmBc.config.target', default: 'text',
          options: Object.entries(TARGETS).map(([v, t]) => ({ value: v, labelKey: t.labelKey })) },
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'text' },     presets: TARGET_PRESETS['text'] },
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'history' },   presets: TARGET_PRESETS['history'] },
        { key: 'icon', type: 'icon-picker', labelKey: 'mods.llm.config.icon', default: 'summarize',
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
