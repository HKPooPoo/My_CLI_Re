import { LlmService } from '../../javascript/services/llm-service.js';
import { ModState } from '../../javascript/mod-state.js';
import { t } from '../../javascript/i18n.js';
import { BBMessage } from '../../javascript/blackboard-msg.js';

// ===================== Constants =====================

/**
 * Target definitions: each target maps to a page and a data scope.
 * page  — which page the instance button appears on
 * scope — how to collect input data in activate()
 */
const TARGETS = {
    'bb-head':      { page: 'blackboard-log',    scope: 'head',     labelKey: 'mods.llm.target.bbHead' },
    'bb-branch':    { page: 'blackboard-log',    scope: 'branch',   labelKey: 'mods.llm.target.bbBranch' },
    'bb-all':       { page: 'blackboard-branch', scope: 'all',      labelKey: 'mods.llm.target.bbAll' },
    'wt-text':      { page: 'walkie-typie-text', scope: 'text',     labelKey: 'mods.llm.target.wtText' },
    'wt-dialogue':  { page: 'walkie-typie-text', scope: 'dialogue', labelKey: 'mods.llm.target.wtDialogue' },
    'bc-text':      { page: 'broadcast-channel', scope: 'text',     labelKey: 'mods.llm.target.bcText' },
    'bc-history':   { page: 'broadcast-channel', scope: 'history',  labelKey: 'mods.llm.target.bcHistory' },
};

/**
 * Per-target prompt presets.
 * Each target scope has its own set of quick-fill prompts.
 * Output constraints are NOT baked in — SMALL_MODEL_CONSTRAINT handles that.
 * Unbuilt targets (wt-*, bc-*) have no presets yet.
 */
const TARGET_PRESETS = {
    'bb-head': [
        { labelKey: 'mods.llm.preset.summarize', value: 'Summarize concisely.' },
        { labelKey: 'mods.llm.preset.translate', value: 'Translate to English.' },
        { labelKey: 'mods.llm.preset.polish',    value: 'Improve grammar and clarity. Keep the original meaning.' },
        { labelKey: 'mods.llm.preset.explain',   value: 'Explain in simple terms.' },
    ],
    'bb-branch': [
        { labelKey: 'mods.llm.preset.branchSummary',  value: 'Summarize the key themes across these entries.' },
        { labelKey: 'mods.llm.preset.branchTimeline',  value: 'Describe how the topics evolved over time.' },
        { labelKey: 'mods.llm.preset.branchExtract',   value: 'Extract the most important points from each entry.' },
    ],
    'bb-all': [
        { labelKey: 'mods.llm.preset.allOverview', value: 'Summarize each branch and identify common themes.' },
        { labelKey: 'mods.llm.preset.allCompare',  value: 'Compare the branches. What are the key differences?' },
    ],
};

/**
 * Scope context — tells the model what the input data looks like.
 * Empty for simple scopes (single text is self-evident).
 * Descriptive for multi-entry scopes where structure matters.
 */
const SCOPE_CONTEXT = {
    head:     '',
    text:     '',
    branch:   'Below are timestamped entries from one timeline, newest first.',
    history:  'Below are messages from one channel, newest first.',
    all:      'Below are entries from multiple named branches.',
    dialogue: 'Below is a conversation. [ME] and [PARTNER] are the speakers.',
};

/** Small models add preamble ("Sure! Here's...") — this suppresses it. */
const SMALL_MODEL_CONSTRAINT = 'Respond with the result only. No preamble.';

/**
 * Context budget by provider.
 * Server (Qwen3 2B, num_ctx=2048) needs tight limits.
 * Client (WebLLM, small models) gets moderate limits.
 * API (GPT-4/Claude, 128K+ context) gets generous limits.
 */
function _getContextLimits(provider) {
    if (provider === 'server') return { branch: 4000, all: 3000 };
    if (provider === 'client') return { branch: 8000, all: 12000 };
    return { branch: 12000, all: 20000 };
}

/** Framework defaults */
const CLIENT_MODEL = 'Qwen3-0.6B-q4f16_1-MLC';
const SERVER_MODEL = 'qwen3-vl:2b';  // Fixed — not configurable per-instance

/**
 * Icon choices for the icon-picker field.
 */
const ICONS = [
    { value: 'summarize',        url: '/images/llm-summarize.svg',        labelKey: 'mods.llm.icon.summarize' },
    { value: 'translate',        url: '/images/llm-translate.svg',        labelKey: 'mods.llm.icon.translate' },
    { value: 'polish',           url: '/images/llm-polish.svg',           labelKey: 'mods.llm.icon.polish' },
    { value: 'summarize-files',  url: '/images/llm-summarize-files.svg',  labelKey: 'mods.llm.icon.summarizeFiles' },
    { value: 'summarize-branch', url: '/images/llm-summarize-branch.svg', labelKey: 'mods.llm.icon.summarizeBranch' },
    { value: 'summarize-all',    url: '/images/llm-summarize-all.svg',    labelKey: 'mods.llm.icon.summarizeAll' },
];

// ===================== Template =====================

export default {
    id: 'llm',
    group: 'llm',
    nameKey: 'mods.llm.name',
    descriptionKey: 'mods.llm.desc',
    version: '3.0.0',
    minApiVersion: 1,
    shelfPanelId: 'llm',

    // --- Instance methods ---

    getButtonDataId(config) {
        return 'llm-' + (config.icon || 'summarize');
    },

    getInstanceName(config, tFn) {
        const p = config.prompt || tFn('mods.llm.name');
        return p.length > 30 ? p.slice(0, 27) + '...' : p;
    },

    getIconUrl(config) {
        const icon = ICONS.find(i => i.value === config.icon);
        return icon ? icon.url : '/images/llm-summarize.svg';
    },

    getDeployPages(config) {
        const target = TARGETS[config.target];
        return target ? [target.page] : [];
    },

    defaultInstances: [
        { config: { prompt: 'Translate to English.', icon: 'translate', target: 'bb-head', provider: 'client' } },
        { config: { prompt: 'Summarize concisely.', icon: 'summarize', target: 'bb-head', provider: 'client' } },
        { config: { prompt: 'Improve grammar and clarity. Keep the original meaning.', icon: 'polish', target: 'bb-head', provider: 'client' } },
    ],

    // pages is NOT used (getDeployPages handles per-instance visibility)
    // but kept for DEFAULT_TEXTAREA_MAP resolution in mod-context.js
    pages: {
        'blackboard-log':    { textareaSelector: '#log-textarea' },
        'blackboard-branch': {},
        'walkie-typie-text': { textareaSelector: '#walkie-typie-we-blackboard' },
        'broadcast-channel': { textareaSelector: '#channel-textarea' },
    },

    providers: [
        { id: 'client', type: 'client', nameKey: 'mods.llm.provider.client' },
        { id: 'server', type: 'server', nameKey: 'mods.llm.provider.server', healthEndpoint: '/mods/llm/ollama/health' },
        { id: 'apikey', type: 'cloud', nameKey: 'mods.llm.provider.apikey' },
    ],

    configSchema: [
        // --- What to process (target first — drives prompt presets) ---
        { key: 'target', type: 'select', labelKey: 'mods.llm.config.target', default: 'bb-head',
          options: Object.entries(TARGETS).map(([v, t]) => ({ value: v, labelKey: t.labelKey })) },
        // --- Prompt (per-target presets, same config key) ---
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'bb-head' },    presets: TARGET_PRESETS['bb-head'] },
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'bb-branch' },  presets: TARGET_PRESETS['bb-branch'] },
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'bb-all' },     presets: TARGET_PRESETS['bb-all'] },
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'wt-text' } },
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'wt-dialogue' } },
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'bc-text' } },
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          showWhen: { key: 'target', value: 'bc-history' } },
        // --- Icon ---
        { key: 'icon', type: 'icon-picker', labelKey: 'mods.llm.config.icon', default: 'summarize',
          icons: ICONS },
        // --- Where to run ---
        { key: 'provider', type: 'select', labelKey: 'mods.llm.config.provider', default: 'client', options: [
            { value: 'client', labelKey: 'mods.llm.provider.client' },
            { value: 'server', labelKey: 'mods.llm.provider.server' },
            { value: 'apikey', labelKey: 'mods.llm.provider.apikey' },
        ]},
        // --- Client: pick browser model ---
        { key: 'clientModel', type: 'select', labelKey: 'mods.llm.config.clientModel', default: 'Qwen3-0.6B-q4f16_1-MLC', showWhen: { key: 'provider', value: 'client' }, options: [
            { value: 'Qwen3-0.6B-q4f16_1-MLC', labelKey: 'mods.llm.clientModel.qwen3_06b' },
            { value: 'Qwen3-1.7B-q4f16_1-MLC', labelKey: 'mods.llm.clientModel.qwen3_17b' },
            { value: 'Qwen3-4B-q4f16_1-MLC',   labelKey: 'mods.llm.clientModel.qwen3_4b' },
        ]},
        // --- Server: fixed model, show info + test button ---
        { key: 'serverModel', type: 'info', labelKey: 'mods.llm.config.serverModel', showWhen: { key: 'provider', value: 'server' } },
        { key: 'serverTest', type: 'action', labelKey: 'mods.llm.config.serverTest', actionLabelKey: 'mods.llm.serverTestBtn', showWhen: { key: 'provider', value: 'server' } },
        // --- 3rd Party: API credentials ---
        { key: 'apiProvider', type: 'select', labelKey: 'mods.llm.config.apiProvider', default: 'openai', showWhen: { key: 'provider', value: 'apikey' }, options: [
            { value: 'openai',    labelKey: 'mods.llm.apiProvider.openai' },
            { value: 'anthropic', labelKey: 'mods.llm.apiProvider.anthropic' },
        ]},
        { key: 'apiModel', type: 'text', labelKey: 'mods.llm.config.apiModel', default: 'gpt-4o-mini', showWhen: { key: 'provider', value: 'apikey' } },
        { key: 'apiKey', type: 'text', labelKey: 'mods.llm.config.apiKey', default: '', showWhen: { key: 'provider', value: 'apikey' } },
        // --- Tuning ---
        { key: 'temperature', type: 'range', labelKey: 'mods.llm.config.temperature', min: 0, max: 1, step: 0.1, default: 0.3 },
    ],

    // --- State (per-template, not per-instance) ---
    _outputEl: null,

    // --- Lifecycle ---

    _ensureOutputEl() {
        if (this._outputEl && this._outputEl.isConnected) return this._outputEl;
        this._outputEl = document.getElementById('llm-output');
        if (this._outputEl) return this._outputEl;

        const shelf = document.querySelector('[data-feature-shelf="llm"]');
        if (shelf) {
            const el = document.createElement('textarea');
            el.id = 'llm-output';
            el.className = 'mod-shelf-output';
            el.readOnly = true;
            shelf.appendChild(el);
            this._outputEl = el;
        }
        return this._outputEl;
    },

    async init(ctx) {
        // Migrate old config format (task → prompt/icon/target)
        _migrateOldConfig();

        const shelf = ctx.ui.getShelfElement();
        if (shelf) {
            const existing = shelf.querySelector('#llm-output');
            if (existing) {
                this._outputEl = existing;
            } else {
                const el = document.createElement('textarea');
                el.id = 'llm-output';
                el.className = 'mod-shelf-output';
                el.readOnly = true;
                shelf.appendChild(el);
                this._outputEl = el;
            }
        }
    },

    async activate(ctx) {
        if (!ctx) return;

        const out = this._ensureOutputEl();
        if (!out) return;

        const tFn = ctx.i18n.t;
        const config = ctx.config;
        const prompt = config.prompt;

        if (!prompt) {
            out.value = tFn('mods.llm.noPrompt');
            return;
        }

        out.value = tFn('mods.llm.processing');

        try {
            const targetDef = TARGETS[config.target] || TARGETS['bb-head'];
            const provider = config.provider || 'client';
            const temp = parseFloat(config.temperature) || 0.3;
            const limits = _getContextLimits(provider);
            const inputText = await _collectInput(ctx, targetDef.scope, tFn, limits);

            if (!inputText) {
                out.value = tFn('mods.llm.empty');
                return;
            }

            const messages = _buildMessages(prompt, inputText, targetDef.scope, provider);

            if (provider === 'client') {
                if (!navigator.gpu) {
                    out.value = tFn('mods.llm.noWebGPU');
                    return;
                }

                try {
                    const svc = await _getWebLlm();
                    const model = config.clientModel || CLIENT_MODEL;

                    out.value = tFn('mods.llm.loading');
                    await svc.ensureModel(model, (p) => { out.value = p; });

                    out.value = '';
                    for await (const chunk of svc.chat(messages, { temperature: temp })) {
                        if (chunk.done) break;
                        out.value += chunk.delta;
                    }

                    if (!out.value.trim()) out.value = tFn('mods.llm.noOutput');
                } catch (e) {
                    console.error('[llm-mod] client error:', e);
                    out.value = tFn('mods.llm.clientError', { error: e.message || String(e) });
                }
            } else if (provider === 'server') {
                out.value = tFn('mods.llm.connecting');

                try {
                    let tokens = 0;
                    for await (const chunk of LlmService.chatStream({
                        provider: 'ollama', model: SERVER_MODEL, messages,
                        temperature: temp,
                    })) {
                        if (chunk.error) throw new Error(chunk.error);
                        if (chunk.done) break;
                        const text = _cleanDelta(chunk.delta, tokens === 0);
                        if (!text) continue;
                        if (tokens === 0) out.value = '';
                        out.value += text;
                        tokens++;
                    }

                    if (!out.value.trim()) out.value = tFn('mods.llm.noOutput');
                } catch (e) {
                    console.error('[llm-mod] server error:', e);
                    out.value = tFn('mods.llm.serverError', { error: e.message || String(e) });
                }
            } else {
                if (!config.apiKey) {
                    out.value = tFn('mods.llm.noApiKey');
                    return;
                }

                try {
                    out.value = tFn('mods.llm.processing');
                    const result = await LlmService.chat({
                        provider: config.apiProvider || 'openai',
                        model: config.apiModel || 'gpt-4o-mini',
                        messages, temperature: temp,
                        apiKey: config.apiKey,
                    });
                    out.value = result.content || tFn('mods.llm.noOutput');
                } catch (e) {
                    console.error('[llm-mod] api error:', e);
                    out.value = tFn('mods.llm.apiError', { error: e.message || String(e) });
                }
            }
        } catch (e) {
            console.error('[llm-mod] activate error:', e);
            out.value = tFn('mods.llm.error', { error: e.message || String(e) });
        }
    },

    async deactivate() {},
    destroy() {},

    async checkHealth(instanceConfig) {
        const p = instanceConfig?.provider || 'client';
        if (p === 'client') return navigator.gpu ? 'online' : 'offline';
        if (p === 'server') {
            try { await LlmService.ollamaHealth(); return 'online'; } catch { return 'offline'; }
        }
        return 'online';
    },

    getInfoValue(key) {
        if (key === 'serverModel') return SERVER_MODEL;
        return '\u2014';
    },

    async onAction(key) {
        if (key === 'serverTest') {
            const msg = BBMessage.info(t('mods.llm.serverTesting'));
            try {
                const res = await LlmService.ollamaHealth();
                const models = res.models || [];
                const hasModel = models.includes(SERVER_MODEL);
                if (res.status === 'online' && hasModel) {
                    msg.update(t('mods.llm.serverOnline', { model: SERVER_MODEL }), 3000);
                } else if (res.status === 'online') {
                    msg.update(t('mods.llm.serverNoModel', { model: SERVER_MODEL, available: models.join(', ') || '—' }), 5000);
                } else {
                    msg.update(t('mods.llm.serverOffline'), 3000);
                }
            } catch {
                msg.update(t('mods.llm.serverOffline'), 3000);
            }
        }
    },
};

// ===================== Private helpers =====================

let _webLlmSvc = null;
async function _getWebLlm() {
    if (!_webLlmSvc) {
        const m = await import('../../javascript/services/webllm-service.js');
        _webLlmSvc = m.WebLlmService;
    }
    return _webLlmSvc;
}

/**
 * Format a timestamp as ISO-style "YYYY-MM-DD HH:mm".
 */
function _formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(Number(ts));
    return d.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Format a list of records as numbered entries.
 * Returns { text, count, truncated }.
 */
function _formatRecords(records, maxChars) {
    const entries = [];
    let total = 0;
    let truncated = 0;

    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const text = (r.text || '').trim();
        if (!text) continue;
        const entry = `[${entries.length + 1}] ${_formatTimestamp(r.timestamp)}\n${text}`;
        if (maxChars && total + entry.length > maxChars) {
            truncated = records.length - i;
            break;
        }
        entries.push(entry);
        total += entry.length;
    }

    return { text: entries.join('\n\n'), count: entries.length + truncated, truncated };
}

/**
 * Collect input text based on target scope.
 * Produces structured context that helps the model understand the data shape.
 * @param {object} limits - { branch, all } char limits from _getContextLimits()
 */
async function _collectInput(ctx, scope, tFn, limits) {
    switch (scope) {
        case 'head':
        case 'text':
            return ctx.board.getText().trim();

        case 'branch':
        case 'history': {
            const records = await ctx.board.getAllRecords();
            if (!records || records.length === 0) return '';
            const branchName = ctx.board.getBranchName() || ctx.board.getBranchId() || 'unnamed';
            const { text, count, truncated } = _formatRecords(records, limits.branch);
            if (!text) return '';
            const header = `[Branch: ${branchName} | ${count} entries | newest first]`;
            const suffix = truncated ? `\n\n[... ${truncated} more entries truncated]` : '';
            return header + '\n\n' + text + suffix;
        }

        case 'all': {
            const branches = await ctx.board.getAllBranches();
            if (!branches || branches.length === 0) return '';
            const sections = [];
            let totalChars = 0;

            for (const branch of branches) {
                const name = branch.name || branch.id;
                const records = await ctx.board.getAllRecordsForBranch(branch.id);
                const perBranchLimit = Math.floor(limits.all / branches.length);
                const { text, count, truncated } = _formatRecords(records, perBranchLimit);
                if (!text) continue;
                const lastUpdate = _formatTimestamp(branch.lastUpdate);
                let section = `## ${name} (${count} entries, last updated: ${lastUpdate})\n\n${text}`;
                if (truncated) section += `\n\n[... ${truncated} more entries truncated]`;
                if (totalChars + section.length > limits.all) break;
                sections.push(section);
                totalChars += section.length;
            }

            if (sections.length === 0) return '';
            const header = `[All Branches: ${branches.length} total]`;
            return header + '\n\n' + sections.join('\n\n');
        }

        case 'dialogue': {
            // BYPASS: read both WT textareas directly — no framework API for partner textarea yet
            const myText = ctx.board.getText().trim();
            const partnerEl = document.querySelector('#walkie-typie-they-blackboard');
            const partnerText = partnerEl ? partnerEl.value.trim() : '';
            const parts = [];
            if (myText) parts.push(`[ME]\n${myText}`);
            if (partnerText) parts.push(`[PARTNER]\n${partnerText}`);
            return parts.join('\n\n');
        }

        default:
            return ctx.board.getText().trim();
    }
}

/**
 * Strip <think> tags from streaming delta (safety net for Qwen3 thinking mode).
 * Keeps content between tags — small models sometimes put answers inside think blocks.
 */
function _cleanDelta(text, isFirst) {
    const stripped = text.replace(/<\/?think>/g, '');
    if (!stripped) return '';
    return isFirst ? stripped.replace(/^\n+/, '') : stripped;
}

/**
 * Build the message array for LLM inference.
 *
 * Prompt structure (3 layers):
 *   1. Scope context — what the input data looks like (empty for single text)
 *   2. User's task  — the prompt from config
 *   3. Constraint   — "No preamble" for small models (client/server)
 *
 * Provider strategies:
 *   Client: single user message (proven for small WebLLM models)
 *   Server: system + user, /no_think prefix (Qwen3 on Ollama)
 *   API:    system + user, no constraint (large models follow instructions well)
 */
function _buildMessages(prompt, inputText, scope, provider) {
    const context = SCOPE_CONTEXT[scope] || '';
    const isSmall = provider === 'client' || provider === 'server';

    // Assemble instruction: [context] + task + [constraint]
    const parts = [];
    if (context) parts.push(context);
    parts.push(prompt);
    if (isSmall) parts.push(SMALL_MODEL_CONSTRAINT);
    const instruction = parts.join('\n');

    if (provider === 'client') {
        // Single user message — /no_think handled by webllm-service.js
        return [{ role: 'user', content: `${instruction}\n\n---\n${inputText}` }];
    }

    // Server (Qwen3): /no_think at START disables thinking mode
    // API (GPT-4/Claude): no prefix needed
    const system = provider === 'server'
        ? `/no_think\n${instruction}`
        : instruction;

    return [
        { role: 'system', content: system },
        { role: 'user', content: inputText },
    ];
}

/**
 * Migrate old config format (task-based) to new format (prompt/icon/target).
 * Runs once at init — checks all LLM instances for old `task` key.
 */
function _migrateOldConfig() {
    const instances = ModState.getInstancesByTemplate('llm');
    for (const inst of instances) {
        const config = inst.config;
        if (!config.task) continue; // Already migrated or new format

        // Map old task → new prompt/icon/target
        const task = config.task;
        let prompt = config.systemPrompt || '';
        let icon = 'summarize';
        let target = 'bb-head';

        const LANG_NAMES = { 'zh-TW': '繁體中文', 'zh-CN': '简体中文', 'en': 'English', 'ja': '日本語' };

        switch (task) {
            case 'translate': {
                const lang = LANG_NAMES[config.targetLang] || config.targetLang || '繁體中文';
                if (!prompt) prompt = `Translate to ${lang}.`;
                icon = 'translate';
                target = 'bb-head';
                break;
            }
            case 'summarize':
                if (!prompt) prompt = 'Summarize concisely. Output plain text only.';
                icon = 'summarize';
                target = 'bb-head';
                break;
            case 'polish':
                if (!prompt) prompt = 'Improve grammar and style. Keep the original meaning. Output only the improved text.';
                icon = 'polish';
                target = 'bb-head';
                break;
            case 'summarize-files':
                if (!prompt) prompt = 'Summarize the text and file contents. Output plain text only.';
                icon = 'summarize-files';
                target = 'bb-head';
                break;
            case 'summarize-branch':
                if (!prompt) prompt = 'Summarize these entries. Identify key themes. Output plain text only.';
                icon = 'summarize-branch';
                target = 'bb-branch';
                break;
            case 'summarize-all':
                if (!prompt) prompt = 'Summarize across all branches. Identify patterns. Output plain text only.';
                icon = 'summarize-all';
                target = 'bb-all';
                break;
            default:
                if (!prompt) prompt = 'Summarize concisely. Output plain text only.';
                break;
        }

        // Apply new config keys
        ModState.setConfig(inst.instanceId, 'prompt', prompt);
        ModState.setConfig(inst.instanceId, 'icon', icon);
        ModState.setConfig(inst.instanceId, 'target', target);

        // Remove old keys by setting them to undefined (ModState stores to localStorage)
        // We can't truly delete keys, but setting undefined effectively removes them
        // from the frozen config snapshot. The old keys become harmless noise.

        console.log(`[llm-mod] migrated instance ${inst.instanceId}: task="${task}" → prompt/icon/target`);
    }
}
