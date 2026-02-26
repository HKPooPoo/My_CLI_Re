import { LlmService } from '../../javascript/services/llm-service.js';
import { ModState } from '../../javascript/mod-state.js';
import { t } from '../../javascript/i18n.js';

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
 */
const PRESETS = [
    { labelKey: 'mods.llm.preset.summarize', value: 'Summarize concisely.' },
    { labelKey: 'mods.llm.preset.translate', value: 'Translate to 繁體中文.' },
    { labelKey: 'mods.llm.preset.polish',    value: 'Improve grammar and style. Keep the original meaning.' },
    { labelKey: 'mods.llm.preset.explain',   value: 'Explain this text in simple terms.' },
];

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
        { config: { prompt: 'Translate to 繁體中文.', icon: 'translate', target: 'bb-head', provider: 'client', clientModel: 'Qwen3-0.6B-q4f16_1-MLC' } },
        { config: { prompt: 'Summarize concisely.', icon: 'summarize', target: 'bb-head', provider: 'client', clientModel: 'Qwen3-0.6B-q4f16_1-MLC' } },
        { config: { prompt: 'Improve grammar and style. Keep the original meaning.', icon: 'polish', target: 'bb-head', provider: 'client', clientModel: 'Qwen3-0.6B-q4f16_1-MLC' } },
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
        // --- Identity ---
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '',
          rows: 3, presets: PRESETS },
        { key: 'icon', type: 'icon-picker', labelKey: 'mods.llm.config.icon', default: 'summarize',
          icons: ICONS },
        // --- Target ---
        { key: 'target', type: 'select', labelKey: 'mods.llm.config.target', default: 'bb-head',
          options: Object.entries(TARGETS).map(([v, t]) => ({ value: v, labelKey: t.labelKey })) },
        // --- Engine ---
        { key: 'provider', type: 'select', labelKey: 'mods.llm.config.provider', default: 'client', options: [
            { value: 'client', labelKey: 'mods.llm.provider.client' },
            { value: 'server', labelKey: 'mods.llm.provider.server' },
            { value: 'apikey', labelKey: 'mods.llm.provider.apikey' },
        ]},
        { key: 'clientModel', type: 'select', labelKey: 'mods.llm.config.clientModel', default: 'Qwen3-0.6B-q4f16_1-MLC', showWhen: { key: 'provider', value: 'client' }, options: [
            { value: 'Qwen3-0.6B-q4f16_1-MLC', labelKey: 'mods.llm.clientModel.qwen3_06b' },
            { value: 'Qwen3-1.7B-q4f16_1-MLC', labelKey: 'mods.llm.clientModel.qwen3_17b' },
            { value: 'Qwen3-4B-q4f16_1-MLC',   labelKey: 'mods.llm.clientModel.qwen3_4b' },
        ]},
        { key: 'clientStatus', type: 'info', labelKey: 'mods.llm.config.clientStatus', showWhen: { key: 'provider', value: 'client' } },
        { key: 'serverModel', type: 'text', labelKey: 'mods.llm.config.serverModel', default: 'qwen3:4b', showWhen: { key: 'provider', value: 'server' } },
        { key: 'serverStatus', type: 'info', labelKey: 'mods.llm.config.serverStatus', showWhen: { key: 'provider', value: 'server' } },
        { key: 'apiProvider', type: 'select', labelKey: 'mods.llm.config.apiProvider', default: 'openai', showWhen: { key: 'provider', value: 'apikey' }, options: [
            { value: 'openai',    labelKey: 'mods.llm.apiProvider.openai' },
            { value: 'anthropic', labelKey: 'mods.llm.apiProvider.anthropic' },
        ]},
        { key: 'apiModel', type: 'text', labelKey: 'mods.llm.config.apiModel', default: 'gpt-4o-mini', showWhen: { key: 'provider', value: 'apikey' } },
        { key: 'apiKey', type: 'text', labelKey: 'mods.llm.config.apiKey', default: '', showWhen: { key: 'provider', value: 'apikey' } },
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
            const inputText = ctx.board.getText().trim();

            if (!inputText) {
                out.value = tFn('mods.llm.empty');
                return;
            }

            const provider = config.provider || 'client';
            const temp = parseFloat(config.temperature) || 0.3;

            if (provider === 'client') {
                const svc = await _getWebLlm();
                const model = config.clientModel || 'Qwen3-0.6B-q4f16_1-MLC';

                out.value = tFn('mods.llm.loading');
                await svc.ensureModel(model, (p) => { out.value = p; });

                // Single user message with embedded instruction
                // (proven pattern — better for small models)
                const messages = [{ role: 'user', content: prompt + '\n\n' + inputText }];

                out.value = '';
                for await (const chunk of svc.chat(messages, { temperature: temp })) {
                    if (chunk.done) break;
                    out.value += chunk.delta;
                }

                if (!out.value.trim()) {
                    out.value = tFn('mods.llm.empty');
                }
            } else {
                // Server/API: system + user messages (standard for capable models)
                const messages = [
                    { role: 'system', content: prompt },
                    { role: 'user', content: inputText },
                ];
                const actualProvider = provider === 'server' ? 'ollama' : (config.apiProvider || 'openai');
                const model = provider === 'server' ? (config.serverModel || 'qwen3:4b') : (config.apiModel || 'gpt-4o-mini');
                const result = await LlmService.chat({
                    provider: actualProvider, model, messages,
                    temperature: temp,
                    apiKey: config.apiKey || '',
                });
                out.value = result.content || tFn('mods.llm.empty');
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
        if (key === 'clientStatus') {
            if (!navigator.gpu) return t('mods.llm.noWebGPU');
            return t('mods.llm.notLoaded');
        }
        if (key === 'serverStatus') return '\u2014';
        return '\u2014';
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
 * Collect input text based on target scope.
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
            return records.map(r => {
                const ts = r.timestamp ? new Date(Number(r.timestamp)).toLocaleString() : '';
                return `[${ts}] ${r.text || ''}`;
            }).join('\n\n');
        }

        case 'all': {
            const branches = await ctx.board.getAllBranches();
            if (!branches || branches.length === 0) return '';
            const parts = [];
            for (const branch of branches) {
                const name = branch.branch_name || branch.name || branch.id;
                parts.push(`=== ${name} ===`);
                if (Array.isArray(branch.records)) {
                    for (const r of branch.records) {
                        const ts = r.timestamp ? new Date(Number(r.timestamp)).toLocaleString() : '';
                        parts.push(`[${ts}] ${r.text || ''}`);
                    }
                }
            }
            return parts.join('\n');
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
                if (!prompt) prompt = 'Summarize concisely.';
                icon = 'summarize';
                target = 'bb-head';
                break;
            case 'polish':
                if (!prompt) prompt = 'Improve grammar and style. Keep the original meaning.';
                icon = 'polish';
                target = 'bb-head';
                break;
            case 'summarize-files':
                if (!prompt) prompt = 'Summarize the text and file contents.';
                icon = 'summarize-files';
                target = 'bb-head';
                break;
            case 'summarize-branch':
                if (!prompt) prompt = 'Summarize these entries. Identify key themes.';
                icon = 'summarize-branch';
                target = 'bb-branch';
                break;
            case 'summarize-all':
                if (!prompt) prompt = 'Summarize across all branches. Identify patterns.';
                icon = 'summarize-all';
                target = 'bb-all';
                break;
            default:
                if (!prompt) prompt = 'Summarize concisely.';
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
