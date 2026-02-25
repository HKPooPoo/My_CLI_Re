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
        { config: { task: 'translate', targetLang: 'zh-TW', provider: 'client', clientModel: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' } },
        { config: { task: 'summarize', provider: 'client', clientModel: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' } },
        { config: { task: 'polish', provider: 'client', clientModel: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' } },
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
        { key: 'clientModel', type: 'select', labelKey: 'mods.llm.config.clientModel', default: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', showWhen: { key: 'provider', value: 'client' }, options: [
            { value: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', labelKey: 'mods.llm.clientModel.qwen25_05b' },
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

    async init(ctx) {
        const shelf = ctx.ui.getShelfElement();
        if (shelf) {
            const el = document.createElement('textarea');
            el.id = 'llm-output';
            el.readOnly = true;
            shelf.appendChild(el);
            this._outputEl = el;
        }
    },

    async activate(ctx) {
        if (!ctx) return;
        if (!this._outputEl) return;

        const tFn = ctx.i18n.t;
        const text = ctx.board.getText().trim();

        if (!text) {
            this._outputEl.value = tFn('mods.llm.empty');
            return;
        }

        this._outputEl.value = tFn('mods.llm.processing');

        try {
            const task = ctx.config.task || 'summarize';
            const provider = ctx.config.provider || 'client';
            const prompt = _buildSystemPrompt(ctx.config, task);
            const messages = [
                { role: 'system', content: prompt },
                { role: 'user', content: text },
            ];

            if (provider === 'client') {
                const svc = await _getWebLlm();
                const model = ctx.config.clientModel || 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
                const temp = parseFloat(ctx.config.temperature) || 0.3;

                this._outputEl.value = tFn('mods.llm.loading');
                await svc.ensureModel(model, (p) => { this._outputEl.value = p; });

                this._outputEl.value = '';
                for await (const chunk of svc.chat(messages, { temperature: temp })) {
                    if (chunk.done) break;
                    this._outputEl.value += chunk.delta;
                }
            } else {
                const actualProvider = provider === 'server' ? 'ollama' : (ctx.config.apiProvider || 'openai');
                const model = provider === 'server' ? (ctx.config.serverModel || 'qwen3:4b') : (ctx.config.apiModel || 'gpt-4o-mini');
                const result = await LlmService.chat({
                    provider: actualProvider, model, messages,
                    temperature: parseFloat(ctx.config.temperature) || 0.3,
                    apiKey: ctx.config.apiKey || '',
                });
                this._outputEl.value = result.content || tFn('mods.llm.empty');
            }
        } catch (e) {
            this._outputEl.value = tFn('mods.llm.error', { error: e.message || String(e) });
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

const PROMPTS = {
    translate: (lang) => `Translate the following text to ${lang}. Output only the translation.`,
    summarize: 'Summarize the following text concisely. Output only the summary.',
    polish: 'Improve the grammar, clarity, and style. Keep the original meaning. Output only the improved text.',
    'summarize-files': 'Summarize the following text and file contents concisely.',
    'summarize-branch': 'Summarize the following entries. Identify key themes.',
    'summarize-all': 'Summarize across all the following branches. Identify patterns.',
};

function _buildSystemPrompt(config, task) {
    if (config.systemPrompt) return config.systemPrompt;
    const base = PROMPTS[task];
    return typeof base === 'function' ? base(config.targetLang || 'zh-TW') : (base || PROMPTS.summarize);
}
