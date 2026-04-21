/**
 * Feature: AI Tutor (LLM)
 *
 * Shelf UI: single-row SEND + dropdown → streaming output with markdown render.
 * SEND is placed LEFT of the dropdown because the shelf drags right-to-left;
 * the primary action sits furthest from the drag edge so accidental fling-
 * close gestures can't brush the button.
 *
 * Prompts are hardcoded with baked-in scope (page / branch / schedule).
 * No user customisation per "傻瓜式" direction.
 */

import { LlmService } from '../services/llm-service.js';
import { BBState } from '../blackboard.js';
import { BCChannel } from '../broadcast-channel.js';
import { BBCore } from '../blackboard-core.js';
import { BBMessage } from '../blackboard-msg.js';

const ICON_URL = '/images/ai-tutor.svg';
const MODEL = 'qwen3.5:4b';
const TEMPERATURE = 0.3;
const SYSTEM_PROMPT =
    'You are a helpful study assistant for university students. ' +
    'Answer clearly and concisely in academic English. ' +
    'When asked to generate JSON, respond with ONLY valid JSON — no prose around it.';

// Four hardcoded actions. Each declares its scope so context gatherer
// knows what to pick up.
const PROMPTS = [
    {
        key: 'summarise_page',
        label: 'Summarize this page',
        scope: 'page',
        prompt: 'Summarise the following content in concise bullet points:',
    },
    {
        key: 'summarise_scope',
        label: 'Summarize this notebook / channel',
        scope: 'branch',
        prompt: 'You have the full set of notes below. Summarise the key themes and conclusions:',
    },
    {
        key: 'translate_zhtw',
        label: 'Translate this page to 繁中',
        scope: 'page',
        prompt: 'Translate the following to Traditional Chinese (繁體中文), preserving meaning and any technical terms:',
    },
    {
        key: 'suggest_schedule',
        label: 'Suggest a schedule for me',
        scope: 'schedule',
        prompt:
            'Suggest a reasonable 7-day study schedule based on the current time and the ' +
            'user\'s calendar events below. Account for existing commitments and leave room ' +
            'for rest. Format as a day-by-day list:',
    },
];

let $select = null;
let $sendBtn = null;
let $output = null;
let _busy = false;

// ── Context gathering ─────────────────────────────────────────────

function getCurrentPage() {
    return document.querySelector('.page.active')?.dataset.page || null;
}

async function gatherContext(scope) {
    const page = getCurrentPage();

    if (scope === 'schedule') {
        // Special: not from page content. Inject current time + user calendar.
        const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' });
        let calendar = {};
        try {
            calendar = JSON.parse(localStorage.getItem('user-calendar') || '{}');
        } catch { /* empty stub */ }
        const events = Object.keys(calendar).length
            ? JSON.stringify(calendar, null, 2)
            : '(no events yet)';
        return `Current time (Asia/Hong_Kong): ${now}\n\nUser's calendar events:\n${events}`;
    }

    if (page === 'blackboard-log') {
        if (scope === 'page') {
            return document.getElementById('log-textarea')?.value || '';
        }
        if (!BBState?.branchId) return '';
        const records = await BBCore.getAllRecordsForBranch(BBState.owner, BBState.branchId);
        return records.map((r, i) => `--- Page ${i + 1} ---\n${r.text || ''}`).join('\n\n');
    }

    if (page === 'broadcast-channel') {
        if (scope === 'page') {
            return document.getElementById('channel-textarea')?.value || '';
        }
        const localId = BCChannel?.state?.localChannelId;
        if (!localId) return '';
        try {
            const { BCDb } = await import('../broadcast-db.js');
            const records = await BCDb.getAllRecords(localId);
            return records.map((r, i) => `--- Post ${i + 1} ---\n${r.text || ''}`).join('\n\n');
        } catch (e) {
            console.error('[llm] BC context gather failed:', e);
            return '';
        }
    }
    return '';
}

// ── Rendering ─────────────────────────────────────────────────────

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[c]);
}

function sanitizeHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('script, iframe, object, embed, form, style, link, meta, base')
        .forEach(el => el.remove());
    for (const el of div.querySelectorAll('*')) {
        for (const attr of [...el.attributes]) {
            const name = attr.name;
            const val = attr.value.replace(/\s/g, '').toLowerCase();
            if (name.startsWith('on') ||
                ((name === 'href' || name === 'src' || name === 'action') && val.startsWith('javascript:'))) {
                el.removeAttribute(name);
            }
        }
    }
    return div.innerHTML;
}

function renderMarkdown(text) {
    if (typeof marked === 'undefined') {
        return `<pre class="llm-stream">${escapeHtml(text)}</pre>`;
    }
    try {
        return `<div class="llm-md">${sanitizeHtml(marked.parse(text, { breaks: true, gfm: true }))}</div>`;
    } catch {
        return `<pre class="llm-stream">${escapeHtml(text)}</pre>`;
    }
}

// ── Streaming send ────────────────────────────────────────────────

function setBusy(busy) {
    _busy = busy;
    if ($sendBtn) {
        $sendBtn.disabled = busy;
        $sendBtn.textContent = busy ? '…' : 'SEND';
    }
}

async function send() {
    if (_busy) return;
    const chosenKey = $select.value;
    const spec = PROMPTS.find(p => p.key === chosenKey);
    if (!spec) return;

    const context = await gatherContext(spec.scope);
    if (!context.trim()) {
        $output.innerHTML = '<div class="llm-empty">NO CONTENT</div>';
        return;
    }

    setBusy(true);
    $output.innerHTML = '<div class="llm-empty">THINKING…</div>';
    let fullText = '';

    try {
        const body = {
            provider: 'ollama',
            model: MODEL,
            temperature: TEMPERATURE,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `${spec.prompt}\n\n${context}` },
            ],
        };
        for await (const chunk of LlmService.chatStream(body)) {
            if (chunk?.error) throw new Error(chunk.error);
            if (chunk?.status) continue;
            const delta = chunk?.delta ?? '';
            if (!delta) {
                if (chunk?.done) break;
                continue;
            }
            fullText += delta;
            $output.innerHTML = renderMarkdown(fullText);
            $output.scrollTop = $output.scrollHeight;
            if (chunk?.done) break;
        }
    } catch (e) {
        console.error('[llm] stream failed:', e);
        $output.innerHTML = `<div class="llm-error">ERROR: ${escapeHtml(e.message || String(e))}</div>`;
    } finally {
        setBusy(false);
    }

    // Create-flashcards hook — Tier 9d will persist to per-branch storage.
    // Detection stays general (any response shape with front/back pairs).
    if (fullText.trim()) {
        try {
            const cleaned = fullText.trim().replace(/^```json\s*|\s*```$/g, '');
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed) && parsed.every(c => c?.front && c?.back)) {
                BBMessage.success(`AI generated ${parsed.length} flashcards`);
            }
        } catch { /* not JSON */ }
    }
}

// ── Feature contract ──────────────────────────────────────────────

export const feature = {
    id: 'llm',
    iconUrl: ICON_URL,
    pages: ['blackboard-log', 'broadcast-channel'],
    hasShelf: true,
    initShelf($shelf) {
        const options = PROMPTS.map(
            p => `<option value="${p.key}">${escapeHtml(p.label)}</option>`
        ).join('');
        $shelf.innerHTML = `
            <div class="feature-panel" data-feature="llm">
                <div class="feature-title">AI TUTOR</div>
                <div class="llm-control-row">
                    <button class="llm-send-btn" type="button">SEND</button>
                    <select class="llm-prompt-select">${options}</select>
                </div>
                <div class="llm-output"><div class="llm-empty">READY</div></div>
            </div>
        `;
        $select  = $shelf.querySelector('.llm-prompt-select');
        $sendBtn = $shelf.querySelector('.llm-send-btn');
        $output  = $shelf.querySelector('.llm-output');

        $sendBtn.addEventListener('click', send);
    },
    onOpen() {
        // Output state persists across opens.
    },
};
