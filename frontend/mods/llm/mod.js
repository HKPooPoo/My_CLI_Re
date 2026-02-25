/**
 * LLM MOD Template - AI Text Processing Suite
 * =================================================================
 * Single template, multiple task modes: translate, summarize, polish,
 * summarize-files, summarize-branch, summarize-all.
 *
 * Shared LLM backend config (provider, model, temperature, API key).
 * Results displayed in a shared shelf panel.
 * =================================================================
 */

import { LlmService } from '../../javascript/services/llm-service.js';
import { ModState } from '../../javascript/mod-state.js';
import { MultiStepButton } from '../../javascript/multiStepButton.js';
import { t } from '../../javascript/i18n.js';
import * as BoardProvider from '../../javascript/mod-board-provider.js';

// --- Shelf DOM refs (shared across instances, created once in init) ---
let _statusEl = null;
let _outputEl = null;
let _copyBtn = null;
let _overwriteBtn = null;
let _overwriteMSB = null;
let _lastCtx = null;

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

    version: '1.0.0',

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
        { config: { task: 'translate', targetLang: 'zh-TW', provider: 'ollama', model: 'qwen2.5:7b' } },
        { config: { task: 'summarize', provider: 'ollama', model: 'qwen2.5:7b' } },
        { config: { task: 'polish', provider: 'ollama', model: 'qwen2.5:7b' } },
    ],

    shelfPanelId: 'llm',

    pages: {
        'blackboard-log':    { textareaSelector: '#log-textarea' },
        'walkie-typie-text': { textareaSelector: '#walkie-typie-we-blackboard' },
        'broadcast-channel': { textareaSelector: '#channel-textarea' },
    },

    providers: [
        { id: 'ollama', type: 'server', nameKey: 'mods.llm.provider.ollama',
          healthEndpoint: '/api/mods/llm/ollama/health' },
        { id: 'openai', type: 'cloud', nameKey: 'mods.llm.provider.openai' },
        { id: 'anthropic', type: 'cloud', nameKey: 'mods.llm.provider.anthropic' },
    ],

    configSchema: [
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
        {
            key: 'provider', type: 'select', labelKey: 'mods.llm.config.provider',
            options: [
                { value: 'ollama',    labelKey: 'mods.llm.provider.ollama' },
                { value: 'openai',    labelKey: 'mods.llm.provider.openai' },
                { value: 'anthropic', labelKey: 'mods.llm.provider.anthropic' },
            ],
            default: 'ollama',
        },
        { key: 'model', type: 'text', labelKey: 'mods.llm.config.model', default: 'qwen2.5:7b' },
        { key: 'apiKey', type: 'text', labelKey: 'mods.llm.config.apiKey', default: '' },
        {
            key: 'temperature', type: 'range', labelKey: 'mods.llm.config.temperature',
            min: 0, max: 1, step: 0.1, default: 0.3,
        },
        { key: 'systemPrompt', type: 'text', labelKey: 'mods.llm.config.systemPrompt', default: '' },
        {
            key: 'ollamaStatus', type: 'info', labelKey: 'mods.llm.config.status',
            showWhen: { key: 'provider', value: 'ollama' },
        },
    ],

    tools: [
        {
            name: 'llm_chat',
            description: 'Send a chat message to an LLM provider',
            parameters: {
                type: 'object',
                properties: {
                    messages: { type: 'array', description: 'Chat messages array [{role, content}]' },
                    provider: { type: 'string', description: 'LLM provider', enum: ['ollama', 'openai', 'anthropic'] },
                    model: { type: 'string', description: 'Model name' },
                    temperature: { type: 'number', description: 'Temperature (0-1)' },
                    apiKey: { type: 'string', description: 'API key (for cloud providers)' },
                },
                required: ['messages'],
            },
            async execute(args) {
                const instances = ModState.getInstancesByTemplate('llm');
                const inst = instances[0];
                const cfg = inst?.config || {};
                const result = await LlmService.chat({
                    provider: args.provider || cfg.provider || 'ollama',
                    model: args.model || cfg.model || 'qwen2.5:7b',
                    messages: args.messages,
                    temperature: args.temperature ?? cfg.temperature ?? 0.3,
                    apiKey: args.apiKey || cfg.apiKey || '',
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

        actions.appendChild(_overwriteBtn);
        actions.appendChild(_copyBtn);
        shelf.appendChild(actions);
    },

    async activate(ctx) {
        if (!ctx || !_outputEl) return;

        const task = ctx.config.task || 'summarize';
        _lastCtx = ctx;

        // Show/hide overwrite button
        _overwriteBtn.style.display = task === 'polish' ? '' : 'none';

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

            const result = await LlmService.chat({
                provider: ctx.config.provider || 'ollama',
                model: ctx.config.model || 'qwen2.5:7b',
                messages,
                temperature: parseFloat(ctx.config.temperature) || 0.3,
                apiKey: ctx.config.apiKey || '',
            });

            _outputEl.value = result.content || t('mods.llm.empty');
            _statusEl.textContent = `${result.provider}/${result.model}`;
        } catch (e) {
            console.error('[llm] activate error:', e);
            _outputEl.value = t('mods.llm.error', { error: (e.message || String(e)).toUpperCase() });
            _statusEl.textContent = '';
        }
    },

    async deactivate() {},
    destroy() {},

    async checkHealth(instanceConfig) {
        const provider = instanceConfig?.provider || 'ollama';
        if (provider === 'ollama') {
            const ollama = this.providers.find(p => p.id === 'ollama');
            if (ollama?.healthEndpoint) {
                try {
                    await LlmService.ollamaHealth();
                    return 'online';
                } catch {
                    return 'offline';
                }
            }
        }
        return 'online';
    },

    getInfoValue(key, instanceId) {
        if (key === 'ollamaStatus') {
            const status = instanceId
                ? ModState.getServerStatus(instanceId)
                : 'unknown';
            return t(`mods.status.${status}`);
        }
        return '\u2014';
    },
};

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
