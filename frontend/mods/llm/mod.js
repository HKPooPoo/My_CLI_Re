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
 * Prompt presets — quick-fill chips for the textarea field.
 * Output constraints help the model avoid adding commentary.
 */
const PRESETS = [
    { labelKey: 'mods.llm.preset.summarize', value: 'Summarize concisely. Output plain text only.' },
    { labelKey: 'mods.llm.preset.translate', value: 'Translate to English. Output only the translation.' },
    { labelKey: 'mods.llm.preset.polish',    value: 'Improve grammar and style. Keep the original meaning. Output only the improved text.' },
    { labelKey: 'mods.llm.preset.explain',   value: 'Explain this text in simple terms.' },
];

/**
 * Scope hints — prepended to the user prompt so the model understands
 * the input structure before seeing the data.
 */
const SCOPE_HINTS = {
    head:     'You will receive a single text entry.',
    text:     'You will receive a single text entry.',
    branch:   'You will receive numbered entries from one timeline branch, ordered newest first.',
    history:  'You will receive numbered entries from one channel, ordered newest first.',
    all:      'You will receive entries from multiple branches. Each branch has a header with name and entry count.',
    dialogue: 'You will receive a conversation between [ME] and [PARTNER].',
};

/** Char limits for truncation */
const MAX_BRANCH_CHARS = 12000;  // ~3K tokens per branch
const MAX_ALL_CHARS    = 20000;  // ~5K tokens total for all-branches

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
        { config: { prompt: 'Translate to English. Output only the translation.', icon: 'translate', target: 'bb-head', provider: 'client' } },
        { config: { prompt: 'Summarize concisely. Output plain text only.', icon: 'summarize', target: 'bb-head', provider: 'client' } },
        { config: { prompt: 'Improve grammar and style. Keep the original meaning. Output only the improved text.', icon: 'polish', target: 'bb-head', provider: 'client' } },
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
        // --- What to do ---
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '',
          rows: 3, presets: PRESETS },
        { key: 'icon', type: 'icon-picker', labelKey: 'mods.llm.config.icon', default: 'summarize',
          icons: ICONS },
        { key: 'target', type: 'select', labelKey: 'mods.llm.config.target', default: 'bb-head',
          options: Object.entries(TARGETS).map(([v, t]) => ({ value: v, labelKey: t.labelKey })) },
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
            const inputText = await _collectInput(ctx, targetDef.scope, tFn);

            if (!inputText) {
                out.value = tFn('mods.llm.empty');
                return;
            }

            const provider = config.provider || 'client';
            const temp = parseFloat(config.temperature) || 0.3;
            const messages = _buildMessages(prompt, inputText, targetDef.scope, provider);

            if (provider === 'client') {
                const svc = await _getWebLlm();
                const model = config.clientModel || CLIENT_MODEL;

                out.value = tFn('mods.llm.loading');
                await svc.ensureModel(model, (p) => { out.value = p; });

                out.value = '';
                for await (const chunk of svc.chat(messages, { temperature: temp })) {
                    if (chunk.done) break;
                    out.value += chunk.delta;
                }

                if (!out.value.trim()) {
                    out.value = tFn('mods.llm.noOutput');
                }
            } else if (provider === 'server') {
                const result = await LlmService.chat({
                    provider: 'ollama', model: SERVER_MODEL, messages,
                    temperature: temp,
                });
                out.value = result.content || tFn('mods.llm.noOutput');
            } else {
                const result = await LlmService.chat({
                    provider: config.apiProvider || 'openai',
                    model: config.apiModel || 'gpt-4o-mini',
                    messages, temperature: temp,
                    apiKey: config.apiKey || '',
                });
                out.value = result.content || tFn('mods.llm.noOutput');
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
 */
async function _collectInput(ctx, scope, tFn) {
    switch (scope) {
        case 'head':
        case 'text':
            return ctx.board.getText().trim();

        case 'branch':
        case 'history': {
            const records = await ctx.board.getAllRecords();
            if (!records || records.length === 0) return '';
            const branchName = ctx.board.getBranchName() || ctx.board.getBranchId() || 'unnamed';
            const { text, count, truncated } = _formatRecords(records, MAX_BRANCH_CHARS);
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
                const perBranchLimit = Math.floor(MAX_ALL_CHARS / branches.length);
                const { text, count, truncated } = _formatRecords(records, perBranchLimit);
                if (!text) continue;
                const lastUpdate = _formatTimestamp(branch.lastUpdate);
                let section = `## ${name} (${count} entries, last updated: ${lastUpdate})\n\n${text}`;
                if (truncated) section += `\n\n[... ${truncated} more entries truncated]`;
                if (totalChars + section.length > MAX_ALL_CHARS) break;
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
 * Build the message array for LLM inference.
 * Wraps the user prompt with scope-aware hints for structured understanding.
 */
function _buildMessages(prompt, inputText, scope, provider) {
    const hint = SCOPE_HINTS[scope] || '';
    const system = hint ? `${hint}\n\nTask: ${prompt}` : prompt;

    if (provider === 'client') {
        // Single user message (proven pattern for small browser models)
        return [{ role: 'user', content: system + '\n\n' + inputText }];
    }
    // Server/API: standard system + user split
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
