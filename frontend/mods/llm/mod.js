import { LlmService } from '../../javascript/services/llm-service.js';
import { ModState } from '../../javascript/mod-state.js';
import { t } from '../../javascript/i18n.js';

export default {
    id: 'llm',
    group: 'llm',
    nameKey: 'mods.llm.name',
    descriptionKey: 'mods.llm.desc',
    version: '2.0.0',
    shelfPanelId: 'llm',

    getButtonDataId(config) {
        const task = config.task || 'summarize';
        if (task === 'translate') return `llm-translate-${config.targetLang || 'zh-TW'}`;
        return `llm-${task}`;
    },

    getInstanceName(config, tFn) {
        const task = config.task || 'summarize';
        const key = task.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const label = tFn(`mods.llm.task.${key}`);
        if (task === 'translate') {
            const lang = (config.targetLang || 'zh-TW').replace(/-/g, '');
            return `${tFn('mods.llm.name')} \u2192 ${label} (${tFn('mods.llm.lang.' + lang)})`;
        }
        return `${tFn('mods.llm.name')} \u2192 ${label}`;
    },

    getIconUrl(config) {
        return `/images/llm-${config.task || 'summarize'}.svg`;
    },

    defaultInstances: [
        { config: { task: 'translate', targetLang: 'zh-TW', provider: 'client', clientModel: 'Qwen3-0.6B-q4f16_1-MLC' } },
        { config: { task: 'summarize', provider: 'client', clientModel: 'Qwen3-0.6B-q4f16_1-MLC' } },
        { config: { task: 'polish', provider: 'client', clientModel: 'Qwen3-0.6B-q4f16_1-MLC' } },
    ],

    pages: {
        'blackboard-log':    { textareaSelector: '#log-textarea' },
        'walkie-typie-text': { textareaSelector: '#walkie-typie-we-blackboard' },
        'broadcast-channel': { textareaSelector: '#channel-textarea' },
    },

    providers: [
        { id: 'client', type: 'client', nameKey: 'mods.llm.provider.client' },
        { id: 'server', type: 'server', nameKey: 'mods.llm.provider.server', healthEndpoint: '/mods/llm/ollama/health' },
        { id: 'apikey', type: 'cloud', nameKey: 'mods.llm.provider.apikey' },
    ],

    configSchema: [
        { key: 'task', type: 'select', labelKey: 'mods.llm.config.task', default: 'summarize', options: [
            { value: 'translate',        labelKey: 'mods.llm.task.translate' },
            { value: 'summarize',        labelKey: 'mods.llm.task.summarize' },
            { value: 'polish',           labelKey: 'mods.llm.task.polish' },
            { value: 'summarize-files',  labelKey: 'mods.llm.task.summarizeFiles' },
            { value: 'summarize-branch', labelKey: 'mods.llm.task.summarizeBranch' },
            { value: 'summarize-all',    labelKey: 'mods.llm.task.summarizeAll' },
        ]},
        { key: 'targetLang', type: 'select', labelKey: 'mods.llm.config.targetLang', default: 'zh-TW', showWhen: { key: 'task', value: 'translate' }, options: [
            { value: 'zh-TW', labelKey: 'mods.llm.lang.zhTW' },
            { value: 'zh-CN', labelKey: 'mods.llm.lang.zhCN' },
            { value: 'en',    labelKey: 'mods.llm.lang.en' },
            { value: 'ja',    labelKey: 'mods.llm.lang.ja' },
        ]},
        { key: 'provider', type: 'select', labelKey: 'mods.llm.config.provider', default: 'client', options: [
            { value: 'client', labelKey: 'mods.llm.provider.client' },
            { value: 'server', labelKey: 'mods.llm.provider.server' },
            { value: 'apikey', labelKey: 'mods.llm.provider.apikey' },
        ]},
        { key: 'clientModel', type: 'select', labelKey: 'mods.llm.config.clientModel', default: 'Qwen3-0.6B-q4f16_1-MLC', showWhen: { key: 'provider', value: 'client' }, options: [
            { value: 'Qwen3-0.6B-q4f16_1-MLC',             labelKey: 'mods.llm.clientModel.qwen3_06b' },
            { value: 'Qwen3-1.7B-q4f16_1-MLC',             labelKey: 'mods.llm.clientModel.qwen3_17b' },
            { value: 'Qwen3-4B-q4f16_1-MLC',               labelKey: 'mods.llm.clientModel.qwen3_4b' },
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
        { key: 'systemPrompt', type: 'text', labelKey: 'mods.llm.config.systemPrompt', default: '' },
    ],

    // --- State ---
    _outputEl: null,

    // --- Lifecycle ---

    /**
     * Resilient output element lookup.
     * Re-queries DOM if _outputEl is stale/null. Creates if shelf exists but element doesn't.
     */
    _ensureOutputEl() {
        if (this._outputEl && this._outputEl.isConnected) return this._outputEl;

        // Re-query DOM (element might exist from init)
        this._outputEl = document.getElementById('llm-output');
        if (this._outputEl) return this._outputEl;

        // Create if shelf exists but element doesn't
        const shelf = document.querySelector('[data-feature-shelf="llm"]');
        if (shelf) {
            const el = document.createElement('textarea');
            el.id = 'llm-output';
            el.readOnly = true;
            shelf.appendChild(el);
            this._outputEl = el;
            console.log('[llm-mod] _ensureOutputEl: created #llm-output');
        }
        return this._outputEl;
    },

    async init(ctx) {
        const shelf = ctx.ui.getShelfElement();
        if (shelf) {
            // Avoid duplicate
            const existing = shelf.querySelector('#llm-output');
            if (existing) {
                this._outputEl = existing;
            } else {
                const el = document.createElement('textarea');
                el.id = 'llm-output';
                el.readOnly = true;
                shelf.appendChild(el);
                this._outputEl = el;
            }
            console.log('[llm-mod] init: _outputEl ready');
        } else {
            console.warn('[llm-mod] init: shelf element NOT found');
        }
    },

    async activate(ctx) {
        if (!ctx) return;

        const out = this._ensureOutputEl();
        if (!out) {
            console.error('[llm-mod] activate: no output element — aborting');
            return;
        }

        const tFn = ctx.i18n.t;
        const text = ctx.board.getText().trim();

        if (!text) {
            out.value = tFn('mods.llm.empty');
            return;
        }

        out.value = tFn('mods.llm.processing');

        try {
            const task = ctx.config.task || 'summarize';
            const provider = ctx.config.provider || 'client';

            if (provider === 'client') {
                const svc = await _getWebLlm();
                const model = ctx.config.clientModel || 'Qwen3-0.6B-q4f16_1-MLC';
                const temp = parseFloat(ctx.config.temperature) || 0.3;

                out.value = tFn('mods.llm.loading');
                console.log('[llm-mod] loading model:', model);
                await svc.ensureModel(model, (p) => { out.value = p; });
                console.log('[llm-mod] model ready');

                // Single user message with embedded instruction
                // (proven pattern from test-client-llm.html — better for small models)
                const prefix = _buildUserPrefix(ctx.config, task);
                const messages = [{ role: 'user', content: prefix + text }];

                out.value = '';
                let tokenCount = 0;
                for await (const chunk of svc.chat(messages, { temperature: temp })) {
                    if (chunk.done) break;
                    out.value += chunk.delta;
                    tokenCount++;
                }

                console.log('[llm-mod] streaming done, tokens:', tokenCount);

                // Handle zero-token output (model only produced think tokens)
                if (!out.value.trim()) {
                    out.value = tFn('mods.llm.empty');
                }
            } else {
                // Server/API: system + user messages (standard for capable models)
                const prompt = _buildSystemPrompt(ctx.config, task);
                const messages = [
                    { role: 'system', content: prompt },
                    { role: 'user', content: text },
                ];
                const actualProvider = provider === 'server' ? 'ollama' : (ctx.config.apiProvider || 'openai');
                const model = provider === 'server' ? (ctx.config.serverModel || 'qwen3:4b') : (ctx.config.apiModel || 'gpt-4o-mini');
                const result = await LlmService.chat({
                    provider: actualProvider, model, messages,
                    temperature: parseFloat(ctx.config.temperature) || 0.3,
                    apiKey: ctx.config.apiKey || '',
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

// --- Private helpers ---

let _webLlmSvc = null;
async function _getWebLlm() {
    if (!_webLlmSvc) {
        const m = await import('../../javascript/services/webllm-service.js');
        _webLlmSvc = m.WebLlmService;
    }
    return _webLlmSvc;
}

/**
 * Language name map for prompts (native names work better with small models).
 */
const LANG_NAMES = {
    'zh-TW': '繁體中文',
    'zh-CN': '简体中文',
    'en': 'English',
    'ja': '日本語',
};

/**
 * Build a user-message prefix for client-side (browser) LLM.
 * Single user message with embedded instruction — proven pattern from test page.
 * Small models follow this better than system + user split.
 */
function _buildUserPrefix(config, task) {
    if (config.systemPrompt) return config.systemPrompt + '\n\n';

    const lang = LANG_NAMES[config.targetLang] || config.targetLang || '繁體中文';
    switch (task) {
        case 'translate':        return `翻譯成${lang}：\n\n`;
        case 'summarize':        return `摘要以下文字：\n\n`;
        case 'polish':           return `改善以下文字的文法和風格，保持原意：\n\n`;
        case 'summarize-files':  return `摘要以下文字與檔案內容：\n\n`;
        case 'summarize-branch': return `摘要以下紀錄，找出關鍵主題：\n\n`;
        case 'summarize-all':    return `綜合摘要以下所有分支，找出模式：\n\n`;
        default:                 return `摘要以下文字：\n\n`;
    }
}

/**
 * Build a system prompt for server/API providers (capable models).
 */
const SYSTEM_PROMPTS = {
    translate: (lang) => `Translate the following text to ${lang}. Output only the translation.`,
    summarize: 'Summarize the following text concisely. Output only the summary.',
    polish: 'Improve the grammar, clarity, and style. Keep the original meaning. Output only the improved text.',
    'summarize-files': 'Summarize the following text and file contents concisely.',
    'summarize-branch': 'Summarize the following entries. Identify key themes.',
    'summarize-all': 'Summarize across all the following branches. Identify patterns.',
};

function _buildSystemPrompt(config, task) {
    if (config.systemPrompt) return config.systemPrompt;
    const base = SYSTEM_PROMPTS[task];
    return typeof base === 'function' ? base(config.targetLang || 'zh-TW') : (base || SYSTEM_PROMPTS.summarize);
}
