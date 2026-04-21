/**
 * Feature: AI Tutor (LLM)
 *
 * Shelf UI: prompt dropdown → non-editable preview → SEND → output stream.
 * Prompts are hardcoded with built-in scope (page / branch). No user
 * configuration — "傻瓜式" per user direction.
 *
 * Backend: POST /api/mods/llm/chat/stream (SSE-ish NDJSON streaming via
 * LlmService). Provider is always Ollama, model taken from shared default.
 */

import { LlmService } from '../services/llm-service.js';
import { BBState } from '../blackboard.js';
import { BCChannel } from '../broadcast-channel.js';
import { BBCore } from '../blackboard-core.js';
import { BBMessage } from '../blackboard-msg.js';
import { t } from '../i18n.js';

const ICON_URL = '/images/ai-tutor.svg';
const MODEL = 'qwen3.5:4b';
const TEMPERATURE = 0.3;
const SYSTEM_PROMPT =
    'You are a helpful study assistant for university students. ' +
    'Answer in clear, concise academic English. ' +
    'When asked to generate JSON, respond with ONLY valid JSON — no prose around it.';

const PROMPTS = [
    {
        key: 'summarise_page',
        label: 'Summarise this page',
        scope: 'page',
        prompt: 'Summarise the following content in 3 concise bullet points:',
    },
    {
        key: 'summarise_branch',
        label: 'Summarise this notebook',
        scope: 'branch',
        prompt: 'Summarise the key themes and conclusions across these notes:',
    },
    {
        key: 'extract_concepts',
        label: 'Extract key concepts',
        scope: 'branch',
        prompt: 'List the key concepts from the following notes, grouped and briefly explained:',
    },
    {
        key: 'study_questions',
        label: 'Generate study questions',
        scope: 'branch',
        prompt: 'Generate 5 university-level study questions based on the following notes:',
    },
    {
        key: 'flashcards',
        label: 'Create flashcards',
        scope: 'branch',
        prompt: 'Create 10 flashcards from the following notes. Respond with ONLY a JSON array of {"front": string, "back": string} objects. No prose, no code fences:',
    },
    {
        key: 'eli5',
        label: "Explain like I'm 5",
        scope: 'page',
        prompt: 'Explain the following in simple terms suitable for a beginner, using everyday analogies:',
    },
    {
        key: 'translate_zhtw',
        label: 'Translate to 繁中',
        scope: 'page',
        prompt: 'Translate the following to Traditional Chinese (繁體中文), preserving meaning and technical terms:',
    },
];

// ── DOM refs, set in initShelf ──
let $select = null;
let $preview = null;
let $sendBtn = null;
let $output = null;
let _busy = false;

// ── Context gathering ──────────────────────────────────────────────

function getCurrentPage() {
    return document.querySelector('.page.active')?.dataset.page || null;
}

async function gatherContext(scope) {
    const page = getCurrentPage();
    if (page === 'blackboard-log') {
        if (scope === 'page') {
            return document.getElementById('log-textarea')?.value || '';
        }
        // scope === 'branch' — all records in this BB branch
        if (!BBState?.branchId) return '';
        const records = await BBCore.getAllRecordsForBranch(BBState.owner, BBState.branchId);
        return records.map((r, i) => `--- Page ${i + 1} ---\n${r.text || ''}`).join('\n\n');
    }
    if (page === 'broadcast-channel') {
        if (scope === 'page') {
            return document.getElementById('channel-textarea')?.value || '';
        }
        // scope === 'branch' — all records in this BC channel
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

// ── Streaming send ─────────────────────────────────────────────────

function setBusy(busy) {
    _busy = busy;
    if ($sendBtn) {
        $sendBtn.disabled = busy;
        $sendBtn.textContent = busy ? 'THINKING...' : 'SEND';
    }
}

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[c]);
}

async function send() {
    if (_busy) return;
    const chosenKey = $select.value;
    const spec = PROMPTS.find(p => p.key === chosenKey);
    if (!spec) return;

    const context = await gatherContext(spec.scope);
    if (!context.trim()) {
        $output.innerHTML = '<div class="llm-empty">NO CONTENT TO SUMMARISE</div>';
        return;
    }

    setBusy(true);
    $output.textContent = '';
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
            // Controller emits { delta: "...", done: bool } per token,
            // or { status: 'thinking' } / { status: 'connected' } as
            // periodic heartbeats before / during generation.
            if (chunk?.error) throw new Error(chunk.error);
            if (chunk?.status) continue;
            const delta = chunk?.delta ?? '';
            if (!delta) {
                if (chunk?.done) break;
                continue;
            }
            fullText += delta;
            $output.innerHTML = `<pre class="llm-stream">${escapeHtml(fullText)}</pre>`;
            $output.scrollTop = $output.scrollHeight;
            if (chunk?.done) break;
        }
    } catch (e) {
        console.error('[llm] stream failed:', e);
        $output.innerHTML = `<div class="llm-error">ERROR: ${escapeHtml(e.message || String(e))}</div>`;
    } finally {
        setBusy(false);
    }

    // Special hook: "Create flashcards" — parse JSON and (future Tier 9d)
    // persist to flashcard storage. For now, just toast that it succeeded.
    if (spec.key === 'flashcards' && fullText.trim()) {
        try {
            const parsed = JSON.parse(fullText.trim().replace(/^```json\s*|\s*```$/g, ''));
            if (Array.isArray(parsed) && parsed.every(c => c.front && c.back)) {
                BBMessage.success(`AI generated ${parsed.length} flashcards`);
                // TODO Tier 9d: persist via FlashcardStorage.save(branchId, parsed)
            }
        } catch { /* not JSON — leave as text */ }
    }
}

// ── Feature contract ───────────────────────────────────────────────

function refreshPreview() {
    const key = $select.value;
    const spec = PROMPTS.find(p => p.key === key);
    $preview.textContent = spec ? spec.prompt : '';
}

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
                <label class="llm-field-label">Action</label>
                <select class="llm-prompt-select">${options}</select>
                <label class="llm-field-label">Prompt preview</label>
                <div class="llm-prompt-preview"></div>
                <button class="llm-send-btn" type="button">SEND</button>
                <label class="llm-field-label">Output</label>
                <div class="llm-output"><div class="llm-empty">READY</div></div>
            </div>
        `;
        $select  = $shelf.querySelector('.llm-prompt-select');
        $preview = $shelf.querySelector('.llm-prompt-preview');
        $sendBtn = $shelf.querySelector('.llm-send-btn');
        $output  = $shelf.querySelector('.llm-output');

        $select.addEventListener('change', refreshPreview);
        $sendBtn.addEventListener('click', send);
        refreshPreview();
    },
    onOpen() {
        // Output state persists across opens — don't reset.
    },
};
