/**
 * Shared LLM infrastructure — used by llm, llm-bb, llm-bc templates.
 *
 * Contains: constants, message construction, provider execution,
 * record formatting, config schema, and shelf management.
 */

import { LlmService } from '../../javascript/services/llm-service.js';
import { t } from '../../javascript/i18n.js';
import { BBMessage } from '../../javascript/blackboard-msg.js';

// ===================== Constants =====================

export const CLIENT_MODEL = 'Qwen3-0.6B-q4f16_1-MLC';
export const SERVER_MODEL = 'qwen3-vl:2b-instruct';

export const ICONS = [
    { value: 'summarize',        url: '/images/llm-summarize.svg',        labelKey: 'mods.llm.icon.summarize' },
    { value: 'translate',        url: '/images/llm-translate.svg',        labelKey: 'mods.llm.icon.translate' },
    { value: 'polish',           url: '/images/llm-polish.svg',           labelKey: 'mods.llm.icon.polish' },
    { value: 'summarize-files',  url: '/images/llm-summarize-files.svg',  labelKey: 'mods.llm.icon.summarizeFiles' },
    { value: 'summarize-branch', url: '/images/llm-summarize-branch.svg', labelKey: 'mods.llm.icon.summarizeBranch' },
    { value: 'summarize-all',    url: '/images/llm-summarize-all.svg',    labelKey: 'mods.llm.icon.summarizeAll' },
];

// ===================== Helpers =====================

let _currentAbortController = null;

let _webLlmSvc = null;
async function _getWebLlm() {
    if (!_webLlmSvc) {
        const m = await import('../../javascript/services/webllm-service.js');
        _webLlmSvc = m.WebLlmService;
    }
    return _webLlmSvc;
}

export function formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(Number(ts));
    return d.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Format a list of records as numbered entries.
 * Returns { text, truncated }.
 */
export function formatRecords(records, maxChars) {
    const entries = [];
    let total = 0;
    let truncated = 0;

    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const text = (r.text || '').trim();
        if (!text) continue;
        const entry = `#${entries.length + 1} [${formatTimestamp(r.timestamp)}]\n${text}`;
        if (maxChars && total + entry.length > maxChars) {
            truncated = records.length - i;
            break;
        }
        entries.push(entry);
        total += entry.length;
    }

    return { text: entries.join('\n\n'), truncated };
}

export function getContextLimits(provider) {
    if (provider === 'server') return { branch: 4000, all: 3000 };
    if (provider === 'client') return { branch: 8000, all: 12000 };
    return { branch: 12000, all: 20000 };
}

/**
 * Strip <think> tags from streaming delta (Qwen3 thinking mode safety net).
 */
export function cleanDelta(text, isFirst) {
    const stripped = text.replace(/<\/?think>/g, '');
    if (!stripped) return '';
    return isFirst ? stripped.replace(/^\n+/, '') : stripped;
}

/**
 * Build the message array for LLM inference.
 * Client: single user message with /no_think prefix (small models ignore system).
 * Server + API: proper system + user separation.
 */
export function buildMessages(prompt, inputText, provider) {
    const userContent = `${prompt}\n\n${inputText}`;

    // Client: single message (small models ignore system messages).
    // /no_think prefix for Qwen3 thinking suppression.
    if (provider === 'client') {
        return [{ role: 'user', content:
            `/no_think\nRespond with the result only. No preamble.\n${userContent}`,
        }];
    }

    // Server + API: proper system + user separation
    return [
        { role: 'system', content: 'Respond with the result only. No preamble.' },
        { role: 'user', content: userContent },
    ];
}

// ===================== Shelf =====================

let _activeInstanceId = null;
let _promptHandler = null;
let _configListenerBound = false;

/**
 * Get or create the shared #llm-output textarea in the shelf.
 * All LLM templates share one shelf panel via shelfPanelId: 'llm'.
 */
export function ensureOutputEl(templateObj) {
    if (templateObj._outputEl && templateObj._outputEl.isConnected) return templateObj._outputEl;
    templateObj._outputEl = document.getElementById('llm-output');
    if (templateObj._outputEl) return templateObj._outputEl;

    const shelf = document.querySelector('[data-feature-shelf="llm"]');
    if (shelf) {
        const el = document.createElement('textarea');
        el.id = 'llm-output';
        el.className = 'mod-shelf-output';
        el.readOnly = true;
        shelf.appendChild(el);
        templateObj._outputEl = el;
    }
    return templateObj._outputEl;
}

/** Shared init — set up prompt + output elements from the shelf context. */
export function initShelf(templateObj, ctx) {
    const shelf = ctx.ui.getShelfElement();
    if (!shelf) return;

    // Prompt textarea (editable, shared across LLM templates)
    if (!shelf.querySelector('#llm-prompt')) {
        const prompt = document.createElement('textarea');
        prompt.id = 'llm-prompt';
        prompt.className = 'mod-shelf-prompt';
        prompt.rows = 2;
        prompt.placeholder = t('mods.llm.config.prompt');
        shelf.prepend(prompt);
    }

    // Output textarea (read-only)
    const existing = shelf.querySelector('#llm-output');
    if (existing) {
        templateObj._outputEl = existing;
    } else {
        const el = document.createElement('textarea');
        el.id = 'llm-output';
        el.className = 'mod-shelf-output';
        el.readOnly = true;
        shelf.appendChild(el);
        templateObj._outputEl = el;
    }

    // Config → shelf sync (one-time listener)
    if (!_configListenerBound) {
        _configListenerBound = true;
        window.addEventListener('mods:configChanged', ({ detail }) => {
            if (detail.key === 'prompt' && detail.instanceId === _activeInstanceId) {
                const el = document.getElementById('llm-prompt');
                if (el && el.value !== detail.value) el.value = detail.value || '';
            }
        });
    }
}

/**
 * Sync shelf prompt textarea with the current instance.
 * Called at the start of every activate() across all LLM templates.
 */
export function activateShelfPrompt(ctx) {
    const el = document.getElementById('llm-prompt');
    if (!el) return;

    // Remove previous change handler
    if (_promptHandler) el.removeEventListener('change', _promptHandler);

    _activeInstanceId = ctx.instanceId;
    el.value = ctx.config.prompt || '';

    // Shelf → config sync on blur
    _promptHandler = () => {
        ctx.instance.setConfig('prompt', el.value);
    };
    el.addEventListener('change', _promptHandler);
}

// ===================== Provider execution =====================

/**
 * Execute LLM inference. Handles all three provider paths.
 * Streams/writes output to the given textarea element.
 */
export async function runLlm(config, prompt, inputText, out, tFn) {
    // Abort + Replace: cancel any running request before starting a new one
    if (_currentAbortController) _currentAbortController.abort();
    const controller = new AbortController();
    _currentAbortController = controller;

    const provider = config.provider || 'client';
    const temp = parseFloat(config.temperature) || 0.3;
    const messages = buildMessages(prompt, inputText, provider);

    try {
        out.dataset.loading = 'true';

        if (provider === 'client') {
            if (!navigator.gpu) {
                out.value = tFn('mods.llm.noWebGPU');
                return;
            }

            const svc = await _getWebLlm();
            const model = config.clientModel || CLIENT_MODEL;

            out.value = tFn('mods.llm.loading');
            await svc.ensureModel(model, (p) => { out.value = p; });

            let tokens = 0;
            for await (const chunk of svc.chat(messages, { temperature: temp, signal: controller.signal })) {
                if (controller.signal.aborted) return;
                if (chunk.done) break;
                const text = cleanDelta(chunk.delta, tokens === 0);
                if (!text) continue;
                if (tokens === 0) out.value = '';
                out.value += text;
                tokens++;
            }

            if (!out.value.trim()) out.value = tFn('mods.llm.noOutput');
        } else if (provider === 'server') {
            out.value = tFn('mods.llm.connecting');

            const t0 = Date.now();
            let tokens = 0;
            for await (const chunk of LlmService.chatStream({
                provider: 'ollama', model: SERVER_MODEL, messages,
                temperature: temp,
            }, { signal: controller.signal })) {
                if (chunk.status) {
                    const sec = Math.floor((Date.now() - t0) / 1000);
                    out.value = tFn('mods.llm.thinking', { seconds: sec });
                    continue;
                }
                if (chunk.error) throw new Error(chunk.error);
                if (chunk.done) break;
                const text = cleanDelta(chunk.delta, tokens === 0);
                if (!text) continue;
                if (tokens === 0) out.value = '';
                out.value += text;
                tokens++;
            }

            if (!out.value.trim()) out.value = tFn('mods.llm.noOutput');
        } else {
            if (!config.apiKey) {
                out.value = tFn('mods.llm.noApiKey');
                return;
            }

            out.value = tFn('mods.llm.processing');
            const result = await LlmService.chat({
                provider: config.apiProvider || 'openai',
                model: config.apiModel || 'gpt-4o-mini',
                messages, temperature: temp,
                apiKey: config.apiKey,
            }, { signal: controller.signal });
            out.value = result.content || tFn('mods.llm.noOutput');
        }
    } catch (e) {
        if (controller.signal.aborted) return; // Aborted by newer request — silent exit
        const tag = provider === 'server' ? 'server' : provider === 'client' ? 'client' : 'api';
        console.error(`[llm] ${tag} error:`, e);
        out.value = tFn(`mods.llm.${tag}Error`, { error: e.message || String(e) });
    } finally {
        delete out.dataset.loading;
        if (_currentAbortController === controller) _currentAbortController = null;
    }
}

// ===================== Shared template methods =====================

export async function checkHealth(instanceConfig) {
    const p = instanceConfig?.provider || 'client';
    if (p === 'client') return navigator.gpu ? 'online' : 'offline';
    if (p === 'server') {
        try { await LlmService.ollamaHealth(); return 'online'; } catch { return 'offline'; }
    }
    return 'online';
}

export function getInfoValue(key) {
    if (key === 'serverModel') return SERVER_MODEL;
    return '\u2014';
}

export async function onAction(key) {
    if (key === 'serverTest') {
        const msg = BBMessage.loading(t('mods.llm.serverTesting'));
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
}

/** Shared instance name logic: truncate prompt to 30 chars. */
export function getInstanceName(config, tFn, fallbackKey) {
    const p = config.prompt || tFn(fallbackKey);
    return p.length > 30 ? p.slice(0, 27) + '...' : p;
}

/** Shared icon URL lookup. */
export function getIconUrl(config) {
    const icon = ICONS.find(i => i.value === config.icon);
    return icon ? icon.url : '/images/llm-summarize.svg';
}
