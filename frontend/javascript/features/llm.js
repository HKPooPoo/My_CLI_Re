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
    'You are an AI study assistant inside My CLI, a classroom communication platform used ' +
    'by university students and lecturers. Users write notes in a personal Notebook, chat one-to-one, ' +
    'and read announcements posted by lecturers. You help students understand, summarise, translate, ' +
    'and plan their work. Answer clearly and concisely in academic English. ' +
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
        // Prompt built dynamically in gatherContext so edge cases (empty
        // calendar / all-past events) can be addressed with instructions
        // tailored to the actual data state. See composeSchedulePrompt.
        prompt: '__DYNAMIC_SCHEDULE__',
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

function composeSchedulePrompt() {
    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const nowHk = nowDate.toLocaleString('en-US', {
        timeZone: 'Asia/Hong_Kong',
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    let calendar = {};
    try {
        calendar = JSON.parse(localStorage.getItem('user-calendar') || '{}');
    } catch { /* empty */ }

    const entries = Object.entries(calendar);
    const todayYmd = nowIso.slice(0, 10);
    const upcoming = entries.filter(([date]) => date >= todayYmd);
    const past     = entries.filter(([date]) => date  < todayYmd);

    // Branch on calendar state — the LLM should behave differently when
    // there's nothing to plan around vs. genuinely having events.
    let dataSection;
    let taskSection;

    if (entries.length === 0) {
        dataSection = '(The user has NOT added any calendar events yet. Their personal calendar is empty.)';
        taskSection =
            'TASK:\n' +
            '- Because the calendar is empty, do NOT invent events or deadlines.\n' +
            '- Politely tell the user that their calendar is empty, and that you need events ' +
            '(e.g. lecture dates, assignment deadlines, exam dates) before you can suggest a schedule.\n' +
            '- Suggest they open the Calendar feature (from the scaffold on the right) and add ' +
            'a few upcoming events, then ask you again.';
    } else if (upcoming.length === 0) {
        dataSection = 'Past events (all of the user\'s events are in the past):\n' +
            past.slice(-10).map(([d, t]) => `- ${d}: ${t}`).join('\n');
        taskSection =
            'TASK:\n' +
            '- Acknowledge that all of the user\'s recorded events are in the past — nothing is upcoming.\n' +
            '- Do NOT pretend any past event is still pending or upcoming.\n' +
            '- Suggest the user add upcoming deadlines / lectures to their Calendar before asking again.';
    } else {
        dataSection =
            'Upcoming events (user has added these):\n' +
            upcoming.map(([d, t]) => `- ${d}: ${t}`).join('\n') +
            (past.length
                ? '\n\nPast events (already happened, do NOT schedule these):\n' +
                  past.slice(-5).map(([d, t]) => `- ${d}: ${t}`).join('\n')
                : '');
        taskSection =
            'TASK:\n' +
            '- Propose a 7-day study plan STARTING FROM THE CURRENT DATE ABOVE.\n' +
            '- Every day needs an explicit date (YYYY-MM-DD) and weekday label.\n' +
            '- Respect the user\'s upcoming events — show them on their actual dates, do not overlap them.\n' +
            '\n' +
            'HARD CONSTRAINTS (violating any of these is a failure):\n' +
            '1. Every suggested study block MUST reference a literal event from the calendar above by its EXACT title. If an event title is "Logic Test", the block must say "Study for Logic Test" or "Review for Logic Test" — NOT "Review Logic Fundamentals" or any paraphrase.\n' +
            '2. Do NOT invent specific activities. Forbidden: "mock exam", "sample essay", "past papers", "peer review", "practice questions", "concept mapping", "full-length mock", "draft essay", textbook chapters, teacher names, course materials, or any concrete artefact the user didn\'t write in the calendar.\n' +
            '3. Allowed block types ONLY:\n' +
            '   • Study for <exact event title>\n' +
            '   • Review for <exact event title>\n' +
            '   • Prepare for <exact event title>\n' +
            '   • Free study time\n' +
            '   • Rest day\n' +
            '4. Max 3 blocks per day. One line each. No commentary or explanation paragraphs.\n' +
            '5. If the user has only ONE upcoming event, most days should contain just "Free study time" or "Rest day" plus at most one study block referencing that event. Do NOT fill every day with study activity — the user gave you ONE data point, not a curriculum.\n' +
            '6. Never add sub-bullets, action descriptions, or rationale text under a block. The bullet itself is the entire entry.\n' +
            '\n' +
            'OUTPUT FORMAT (strict):\n' +
            '### YYYY-MM-DD (Weekday)\n' +
            '- <allowed block>\n' +
            '- <allowed block>\n' +
            '\n' +
            'No introduction, no closing remark. Only the 7 dated blocks.';
    }

    return [
        'You are helping a university student plan their coming week using My CLI.',
        '',
        `Current date/time (Asia/Hong_Kong): ${nowHk}`,
        `Machine-readable now (UTC ISO): ${nowIso}`,
        '',
        dataSection,
        '',
        taskSection,
    ].join('\n');
}

async function gatherContext(scope) {
    const page = getCurrentPage();

    if (scope === 'schedule') {
        // Full prompt is built here — replaces the generic per-prompt template.
        return composeSchedulePrompt();
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
        // Schedule prompt is self-contained (context IS the full user message).
        // Other prompts have a short template + page/branch text appended.
        const userMessage = spec.scope === 'schedule'
            ? context
            : `${spec.prompt}\n\n${context}`;

        const body = {
            provider: 'ollama',
            model: MODEL,
            temperature: TEMPERATURE,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
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
