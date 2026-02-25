/**
 * LLM MOD Template v2 — Client-First AI Text Processing
 * ======================================================
 * 3-tier provider architecture:
 *   client  (WebLLM/WebGPU, default) — runs entirely in-browser
 *   server  (Ollama)                 — local server via backend proxy
 *   apikey  (OpenAI/Anthropic)       — cloud API via backend proxy
 *
 * Tasks: translate, summarize, polish, summarize-files,
 *        summarize-branch, summarize-all.
 * ======================================================
 */

import { WebLlmService } from '../../javascript/services/webllm-service.js';
import { LlmService } from '../../javascript/services/llm-service.js';
import { ModState } from '../../javascript/mod-state.js';
import { MultiStepButton } from '../../javascript/multiStepButton.js';
import { t } from '../../javascript/i18n.js';
import * as BoardProvider from '../../javascript/mod-board-provider.js';

// --- Shelf DOM refs (shared across instances, created once in init) ---
let _statusEl = null;
let _outputEl = null;
let _copyBtn = null;
let _stopBtn = null;
let _overwriteBtn = null;
let _overwriteMSB = null;
let _lastCtx = null;
let _abortCtrl = null;

const CHAR_LIMIT_BRANCH = 100_000;
const CHAR_LIMIT_ALL = 200_000;
const FILE_SIZE_LIMIT = 1_048_576; // 1MB

const DEFAULT_PROMPTS = {
    translate: (lang) => `Translate the following text to ${lang}. Output only the translation, no explanations.`,
    summarize: 'Summarize the following text concisely. Output only the summary.',
    polish: 'Improve the grammar, clarity, and style of the following text. Keep the original meaning. Output only the improved text.',
    'summarize-files': 'Summarize the following text and file contents concisely.',
    'summarize-branch': 'Summarize the following collection of text entries. Identify key themes and important points.',
    'summarize-all': 'Provide a comprehensive summary across all the following branches/channels. Identify patterns and key information.',
};

export default {
    // --- Identity ---
    id: 'llm',
    group: 'llm',
    nameKey: 'mods.llm.name',
    descriptionKey: 'mods.llm.desc',

    version: '2.0.0',

    // maxInstances: 0 = unlimited

    getButtonDataId(config) {
        const task = config.task || 'summarize';
        if (task === 'translate') {
            return `llm-translate-${config.targetLang || 'zh-TW'}`;
        }
        return `llm-${task}`;
    },

    getInstanceName(config, tFn) {
        const task = config.task || 'summarize';
        const taskLabel = tFn(`mods.llm.task.${_camelCase(task)}`);
        if (task === 'translate') {
            const lang = (config.targetLang || 'zh-TW').replace(/-/g, '');
            return `${tFn('mods.llm.name')} \u2192 ${taskLabel} (${tFn('mods.llm.lang.' + lang)})`;
        }
        return `${tFn('mods.llm.name')} \u2192 ${taskLabel}`;
    },

    getIconUrl(config) {
        const task = config.task || 'summarize';
        return `/images/llm-${task}.svg`;
    },

    defaultInstances: [
        { config: { task: 'translate', targetLang: 'zh-TW', provider: 'client', clientModel: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' } },
        { config: { task: 'summarize', provider: 'client', clientModel: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' } },
        { config: { task: 'polish', provider: 'client', clientModel: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' } },
    ],

    shelfPanelId: 'llm',

    pages: {
        'blackboard-log':    { textareaSelector: '#log-textarea' },
        'walkie-typie-text': { textareaSelector: '#walkie-typie-we-blackboard' },
        'broadcast-channel': { textareaSelector: '#channel-textarea' },
    },

    providers: [
        { id: 'client', type: 'client', nameKey: 'mods.llm.provider.client' },
        { id: 'server', type: 'server', nameKey: 'mods.llm.provider.server',
          healthEndpoint: '/mods/llm/ollama/health' },
        { id: 'apikey', type: 'cloud', nameKey: 'mods.llm.provider.apikey' },
    ],

    configSchema: [
        // --- Task ---
        {
            key: 'task', type: 'select', labelKey: 'mods.llm.config.task',
            options: [
                { value: 'translate',        labelKey: 'mods.llm.task.translate' },
                { value: 'summarize',        labelKey: 'mods.llm.task.summarize' },
                { value: 'polish',           labelKey: 'mods.llm.task.polish' },
                { value: 'summarize-files',  labelKey: 'mods.llm.task.summarizeFiles' },
                { value: 'summarize-branch', labelKey: 'mods.llm.task.summarizeBranch' },
                { value: 'summarize-all',    labelKey: 'mods.llm.task.summarizeAll' },
            ],
            default: 'summarize',
        },
        // --- Target language (translate only) ---
        {
            key: 'targetLang', type: 'select', labelKey: 'mods.llm.config.targetLang',
            options: [
                { value: 'zh-TW', labelKey: 'mods.llm.lang.zhTW' },
                { value: 'zh-CN', labelKey: 'mods.llm.lang.zhCN' },
                { value: 'en',    labelKey: 'mods.llm.lang.en' },
                { value: 'ja',    labelKey: 'mods.llm.lang.ja' },
            ],
            default: 'zh-TW',
            showWhen: { key: 'task', value: 'translate' },
        },
        // --- Provider ---
        {
            key: 'provider', type: 'select', labelKey: 'mods.llm.config.provider',
            options: [
                { value: 'client', labelKey: 'mods.llm.provider.client' },
                { value: 'server', labelKey: 'mods.llm.provider.server' },
                { value: 'apikey', labelKey: 'mods.llm.provider.apikey' },
            ],
            default: 'client',
        },
        // --- Client: browser model select ---
        {
            key: 'clientModel', type: 'select', labelKey: 'mods.llm.config.clientModel',
            options: [
                { value: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', labelKey: 'mods.llm.clientModel.qwen25_05b' },
                { value: 'Qwen3-0.6B-q4f16_1-MLC',             labelKey: 'mods.llm.clientModel.qwen3_06b' },
                { value: 'Qwen3-1.7B-q4f16_1-MLC',             labelKey: 'mods.llm.clientModel.qwen3_17b' },
                { value: 'Qwen3-4B-q4f16_1-MLC',               labelKey: 'mods.llm.clientModel.qwen3_4b' },
            ],
            default: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
            showWhen: { key: 'provider', value: 'client' },
        },
        // --- Client: engine status (info) ---
        {
            key: 'clientStatus', type: 'info', labelKey: 'mods.llm.config.clientStatus',
            showWhen: { key: 'provider', value: 'client' },
        },
        // --- Server: model name ---
        {
            key: 'serverModel', type: 'text', labelKey: 'mods.llm.config.serverModel',
            default: 'qwen3:4b',
            showWhen: { key: 'provider', value: 'server' },
        },
        // --- Server: status (info) ---
        {
            key: 'serverStatus', type: 'info', labelKey: 'mods.llm.config.serverStatus',
            showWhen: { key: 'provider', value: 'server' },
        },
        // --- API key: provider select ---
        {
            key: 'apiProvider', type: 'select', labelKey: 'mods.llm.config.apiProvider',
            options: [
                { value: 'openai',    labelKey: 'mods.llm.apiProvider.openai' },
                { value: 'anthropic', labelKey: 'mods.llm.apiProvider.anthropic' },
            ],
            default: 'openai',
            showWhen: { key: 'provider', value: 'apikey' },
        },
        // --- API key: model name ---
        {
            key: 'apiModel', type: 'text', labelKey: 'mods.llm.config.apiModel',
            default: 'gpt-4o-mini',
            showWhen: { key: 'provider', value: 'apikey' },
        },
        // --- API key: key input ---
        {
            key: 'apiKey', type: 'text', labelKey: 'mods.llm.config.apiKey',
            default: '',
            showWhen: { key: 'provider', value: 'apikey' },
        },
        // --- Shared: temperature ---
        {
            key: 'temperature', type: 'range', labelKey: 'mods.llm.config.temperature',
            min: 0, max: 1, step: 0.1, default: 0.3,
        },
        // --- Shared: system prompt override ---
        { key: 'systemPrompt', type: 'text', labelKey: 'mods.llm.config.systemPrompt', default: '' },
    ],

    tools: [
        {
            name: 'llm_chat',
            description: 'Send a chat message to an LLM provider',
            parameters: {
                type: 'object',
                properties: {
                    messages: { type: 'array', description: 'Chat messages array [{role, content}]' },
                    provider: { type: 'string', description: 'LLM provider', enum: ['client', 'server', 'apikey'] },
                    model: { type: 'string', description: 'Model name' },
                    temperature: { type: 'number', description: 'Temperature (0-1)' },
                },
                required: ['messages'],
            },
            async execute(args) {
                const instances = ModState.getInstancesByTemplate('llm');
                const inst = instances[0];
                const cfg = inst?.config || {};
                const provider = args.provider || cfg.provider || 'client';

                if (provider === 'client') {
                    const model = args.model || cfg.clientModel || 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
                    await WebLlmService.ensureModel(model);
                    let result = '';
                    for await (const chunk of WebLlmService.chat(args.messages, {
                        temperature: args.temperature ?? cfg.temperature ?? 0.3,
                    })) {
                        result += chunk.delta;
                    }
                    return { content: result };
                }

                // server / apikey → backend
                const actualProvider = provider === 'apikey'
                    ? (cfg.apiProvider || 'openai')
                    : 'ollama';
                const model = args.model
                    || (provider === 'server' ? cfg.serverModel : cfg.apiModel)
                    || 'qwen3:4b';

                const result = await LlmService.chat({
                    provider: actualProvider,
                    model,
                    messages: args.messages,
                    temperature: args.temperature ?? cfg.temperature ?? 0.3,
                    apiKey: cfg.apiKey || '',
                });
                return { content: result.content };
            },
        },
    ],

    // --- Lifecycle ---

    async init(ctx) {
        const shelf = ctx.ui.getShelfElement();
        if (!shelf) return;

        // Status line
        _statusEl = document.createElement('div');
        _statusEl.className = 'llm-status crt-text-orange';
        shelf.appendChild(_statusEl);

        // Output textarea
        _outputEl = document.createElement('textarea');
        _outputEl.id = 'llm-output';
        _outputEl.readOnly = true;
        shelf.appendChild(_outputEl);

        // Actions bar
        const actions = document.createElement('div');
        actions.className = 'llm-actions';

        // Stop button (hidden by default)
        _stopBtn = document.createElement('button');
        _stopBtn.className = 'crt-text-yellow';
        _stopBtn.textContent = t('mods.llm.stopBtn');
        _stopBtn.style.display = 'none';
        _stopBtn.addEventListener('click', () => {
            if (_abortCtrl) {
                _abortCtrl.abort();
            }
        });

        // Overwrite button (confirm pattern)
        _overwriteBtn = document.createElement('button');
        _overwriteBtn.className = 'crt-text-red';
        _overwriteBtn.textContent = t('mods.llm.overwriteBtn');
        _overwriteBtn.style.display = 'none';
        _overwriteMSB = new MultiStepButton(_overwriteBtn, {
            confirm: true,
            confirmLabel: t('mods.llm.overwriteConfirm'),
            sound: 'Click.mp3',
            confirmSound: 'Erase.mp3',
            action: () => {
                if (_lastCtx && _outputEl.value) {
                    _lastCtx.board.setText(_outputEl.value);
                    _statusEl.textContent = t('mods.llm.overwriteDone');
                }
            },
        });

        // Copy button
        _copyBtn = document.createElement('button');
        _copyBtn.className = 'crt-text-green';
        _copyBtn.textContent = t('mods.llm.copyBtn');
        _copyBtn.addEventListener('click', async () => {
            if (_outputEl.value) {
                await navigator.clipboard.writeText(_outputEl.value);
                const orig = _copyBtn.textContent;
                _copyBtn.textContent = t('mods.llm.copyDone');
                setTimeout(() => { _copyBtn.textContent = orig; }, 1500);
            }
        });

        actions.appendChild(_stopBtn);
        actions.appendChild(_overwriteBtn);
        actions.appendChild(_copyBtn);
        shelf.appendChild(actions);
    },

    async activate(ctx) {
        if (!ctx || !_outputEl) return;

        const task = ctx.config.task || 'summarize';
        const provider = ctx.config.provider || 'client';
        _lastCtx = ctx;

        // Show/hide overwrite button
        _overwriteBtn.style.display = task === 'polish' ? '' : 'none';
        _stopBtn.style.display = 'none';

        // Set processing status
        _statusEl.textContent = t('mods.llm.processing');
        _outputEl.value = '';

        try {
            const userContent = await _collectData(ctx, task);
            if (!userContent) {
                _outputEl.value = t('mods.llm.empty');
                _statusEl.textContent = '';
                return;
            }

            const systemPrompt = _getSystemPrompt(ctx.config, task);
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ];

            if (provider === 'client') {
                await _activateClient(ctx, messages);
            } else {
                await _activateBackend(ctx, messages, provider);
            }
        } catch (e) {
            if (e.name === 'AbortError') return; // user stopped — partial output preserved
            console.error('[llm] activate error:', e);
            _outputEl.value = t('mods.llm.error', { error: (e.message || String(e)).toUpperCase() });
            _statusEl.textContent = '';
        } finally {
            _stopBtn.style.display = 'none';
            _abortCtrl = null;
        }
    },

    async deactivate() {},
    destroy() {},

    async checkHealth(instanceConfig) {
        const provider = instanceConfig?.provider || 'client';
        if (provider === 'client') {
            return navigator.gpu ? 'online' : 'offline';
        }
        if (provider === 'server') {
            try {
                await LlmService.ollamaHealth();
                return 'online';
            } catch {
                return 'offline';
            }
        }
        return 'online'; // apikey — no health check
    },

    getInfoValue(key, instanceId) {
        if (key === 'clientStatus') {
            if (!navigator.gpu) return t('mods.llm.noWebGPU');
            const loaded = WebLlmService.getLoadedModel();
            return loaded || t('mods.llm.notLoaded');
        }
        if (key === 'serverStatus') {
            const status = instanceId
                ? ModState.getServerStatus(instanceId)
                : 'unknown';
            return t(`mods.status.${status}`);
        }
        return '\u2014';
    },
};

// =================================================================
//  Client activation (WebLLM streaming)
// =================================================================

async function _activateClient(ctx, messages) {
    if (!WebLlmService.isSupported()) {
        _outputEl.value = t('mods.llm.noWebGPU');
        _statusEl.textContent = '';
        return;
    }

    const clientModel = ctx.config.clientModel || 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
    const temperature = parseFloat(ctx.config.temperature) || 0.3;

    // Show stop button, create abort controller
    _stopBtn.style.display = '';
    _abortCtrl = new AbortController();

    // Loading phase
    _statusEl.textContent = t('mods.llm.loading');
    await WebLlmService.ensureModel(clientModel, (text) => {
        _statusEl.textContent = text;
    });

    // Streaming phase
    _statusEl.textContent = t('mods.llm.streaming', { tokens: '0' });

    for await (const chunk of WebLlmService.chat(messages, {
        temperature,
        signal: _abortCtrl.signal,
    })) {
        if (chunk.done) {
            _statusEl.textContent = `client/${chunk.meta.model} | ${chunk.meta.answerTokens} tok | ${chunk.meta.elapsed}s | ${chunk.meta.tokensPerSecond} tok/s`;
            break;
        }
        _outputEl.value += chunk.delta;
        _statusEl.textContent = t('mods.llm.streaming', { tokens: String(chunk.meta.answerTokens) });
    }

    _stopBtn.style.display = 'none';
}

// =================================================================
//  Backend activation (Server / API key)
// =================================================================

async function _activateBackend(ctx, messages, provider) {
    const config = ctx.config;

    // Resolve actual provider and model for the backend
    let actualProvider, model;
    if (provider === 'server') {
        actualProvider = 'ollama';
        model = config.serverModel || 'qwen3:4b';
    } else {
        // apikey
        actualProvider = config.apiProvider || 'openai';
        model = config.apiModel || 'gpt-4o-mini';
    }

    const result = await LlmService.chat({
        provider: actualProvider,
        model,
        messages,
        temperature: parseFloat(config.temperature) || 0.3,
        apiKey: config.apiKey || '',
    });

    _outputEl.value = result.content || t('mods.llm.empty');
    _statusEl.textContent = `${result.provider}/${result.model}`;
}

// =================================================================
//  Private helpers
// =================================================================

function _camelCase(str) {
    return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function _getSystemPrompt(config, task) {
    if (config.systemPrompt) return config.systemPrompt;
    const base = DEFAULT_PROMPTS[task];
    if (typeof base === 'function') {
        return base(config.targetLang || 'zh-TW');
    }
    return base || DEFAULT_PROMPTS.summarize;
}

async function _collectData(ctx, task) {
    switch (task) {
        case 'translate':
        case 'summarize':
        case 'polish':
            return _collectPageText(ctx);
        case 'summarize-files':
            return _collectPageWithFiles(ctx);
        case 'summarize-branch':
            return _collectBranchRecords(ctx);
        case 'summarize-all':
            return _collectAllBranches(ctx);
        default:
            return _collectPageText(ctx);
    }
}

function _collectPageText(ctx) {
    const text = ctx.board.getText().trim();
    return text || null;
}

async function _collectPageWithFiles(ctx) {
    const text = ctx.board.getText().trim();
    const attachments = ctx.board.getAttachments();

    const parts = [];
    if (text) parts.push(`[Text]\n${text}`);

    for (const hash of attachments) {
        try {
            const meta = await ctx.file.getMeta(hash);
            if (!meta) continue;

            // Skip non-text files
            const mime = meta.mime_type || '';
            if (!mime.startsWith('text/') && !mime.includes('json') && !mime.includes('xml') && !mime.includes('javascript') && !mime.includes('markdown')) {
                parts.push(`[File: ${meta.original_name}] (${t('mods.llm.noTextFiles')}: ${mime})`);
                continue;
            }

            // Size guard
            if (meta.size > FILE_SIZE_LIMIT) {
                parts.push(`[File: ${meta.original_name}] (${t('mods.llm.fileTooLarge')})`);
                continue;
            }

            const content = await ctx.file.readText(hash);
            parts.push(`[File: ${meta.original_name}]\n${content}`);
        } catch (e) {
            parts.push(`[File: ${hash}] (read error)`);
        }
    }

    return parts.length > 0 ? parts.join('\n\n---\n\n') : null;
}

async function _collectBranchRecords(ctx) {
    const records = await ctx.board.getAllRecords();
    if (!records || records.length === 0) {
        return null;
    }

    let total = '';
    const parts = [];
    for (const r of records) {
        const text = r.text || '';
        if (!text.trim()) continue;
        if (total.length + text.length > CHAR_LIMIT_BRANCH) {
            parts.push(`... (${t('mods.llm.tooMuchData')})`);
            break;
        }
        total += text;
        parts.push(text);
    }

    return parts.length > 0 ? parts.join('\n\n---\n\n') : null;
}

async function _collectAllBranches(ctx) {
    const scope = ctx.board.getScope();

    // WT: falls back to single branch (no multi-branch)
    if (scope === 'wt') {
        return _collectBranchRecords(ctx);
    }

    // BC: get all channels
    if (scope === 'bc') {
        return _collectAllBCChannels(ctx);
    }

    // BB: all branches
    const branches = await ctx.board.getAllBranches();
    if (!branches || branches.length === 0) return null;

    let totalChars = 0;
    const sections = [];

    for (const branch of branches) {
        const branchId = branch.branch_id || branch.id;
        const branchName = branch.branch_name || branch.name || branchId;
        const meta = BoardProvider.getCurrentRecord('bb');
        const owner = meta?.owner || 'local';

        const records = await BoardProvider.getAllRecords('bb', branchId, owner);
        if (!records || records.length === 0) continue;

        const texts = [];
        for (const r of records) {
            const txt = r.text || '';
            if (!txt.trim()) continue;
            if (totalChars + txt.length > CHAR_LIMIT_ALL) {
                texts.push(`... (${t('mods.llm.tooMuchData')})`);
                totalChars = CHAR_LIMIT_ALL;
                break;
            }
            totalChars += txt.length;
            texts.push(txt);
        }

        if (texts.length > 0) {
            sections.push(`[Branch: ${branchName}]\n${texts.join('\n---\n')}`);
        }

        if (totalChars >= CHAR_LIMIT_ALL) break;
    }

    return sections.length > 0 ? sections.join('\n\n===\n\n') : null;
}

async function _collectAllBCChannels(ctx) {
    // Import BCMeta dynamically to avoid circular deps at module level
    const { BCMeta, BCDb } = await import('../../javascript/broadcast-db.js');

    const channels = await BCMeta.getAllChannels();
    if (!channels || channels.length === 0) return null;

    let totalChars = 0;
    const sections = [];

    for (const ch of channels) {
        const localId = ch.local_id;
        const name = ch.name || `Channel ${localId}`;

        const records = await BCDb.getAllRecords(localId);
        if (!records || records.length === 0) continue;

        const texts = [];
        for (const r of records) {
            const txt = r.text || '';
            if (!txt.trim()) continue;
            if (totalChars + txt.length > CHAR_LIMIT_ALL) {
                texts.push(`... (${t('mods.llm.tooMuchData')})`);
                totalChars = CHAR_LIMIT_ALL;
                break;
            }
            totalChars += txt.length;
            texts.push(txt);
        }

        if (texts.length > 0) {
            sections.push(`[Channel: ${name}]\n${texts.join('\n---\n')}`);
        }

        if (totalChars >= CHAR_LIMIT_ALL) break;
    }

    return sections.length > 0 ? sections.join('\n\n===\n\n') : null;
}
