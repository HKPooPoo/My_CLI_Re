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
            'OUTPUT STRUCTURE (three parts, in this order):\n' +
            '\n' +
            'PART 1 — MISSION  (one short paragraph, 1–2 sentences):\n' +
            'Introduce yourself as the AI study assistant and state that you are about to plan the next 7 days around the user\'s calendar. Be brief — no fluff, no motivational talk.\n' +
            '\n' +
            'PART 2 — COGNITION  (one short paragraph):\n' +
            'Start with: "From your calendar, I can see you have:" then list each upcoming event from the calendar on its own bullet line, naming the event and its date only. Example bullet: "- Logic Test on 2026-04-23". DO NOT add commentary, importance ratings, difficulty guesses, or emotional support lines. Only the factual list.\n' +
            '\n' +
            'PART 3 — SCHEDULE  (the 7 dated sections):\n' +
            'Plan 7 days starting from the current date above. Every day needs a date and weekday. Follow BLOCK TYPES and RULES below, exactly.\n' +
            '\n' +
            'BLOCK TYPES (the ONLY allowed line formats for PART 3):\n' +
            '• "- <EXACT event title>"           ← use ON THE DATE of that event\n' +
            '• "- Review for <EXACT event>"      ← use 2 days BEFORE the event\n' +
            '• "- Prepare for <EXACT event>"     ← use 1 day BEFORE the event\n' +
            '• "- Free study time"               ← filler for other days\n' +
            '• "- Rest day"                      ← filler for other days\n' +
            '\n' +
            'RULES for PART 3:\n' +
            '1. On a day with an event from the calendar: ONE bullet = the event title verbatim. Nothing else that day.\n' +
            '2. 1–2 days before an event: one Review/Prepare bullet (optional if the day already has another event).\n' +
            '3. Days with no event relationship: exactly ONE bullet, either "Free study time" or "Rest day". Alternate to avoid three identical fillers in a row.\n' +
            '4. 1–2 bullets per day is normal; 3 is the hard max and rarely needed. Never repeat the same bullet on the same day.\n' +
            '5. Do NOT invent activities, courses, essay titles, mock exams, past papers, peer reviews, practice questions, concept maps, textbook chapters, teacher names, or anything not in the calendar.\n' +
            '6. Do NOT write commentary, rationale, or sub-bullets in PART 3.\n' +
            '\n' +
            'EXAMPLE (what correct output looks like end-to-end):\n' +
            'Input events:  { "2026-04-23": "Logic Test" }\n' +
            'Today:         2026-04-21\n' +
            '\n' +
            'I\'m your AI study assistant. Let me plan the next 7 days around what\'s on your calendar.\n' +
            '\n' +
            'From your calendar, I can see you have:\n' +
            '- Logic Test on 2026-04-23\n' +
            '\n' +
            '### 2026-04-21 (Tuesday)\n' +
            '- Review for Logic Test\n' +
            '\n' +
            '### 2026-04-22 (Wednesday)\n' +
            '- Prepare for Logic Test\n' +
            '\n' +
            '### 2026-04-23 (Thursday)\n' +
            '- Logic Test\n' +
            '\n' +
            '### 2026-04-24 (Friday)\n' +
            '- Rest day\n' +
            '\n' +
            '### 2026-04-25 (Saturday)\n' +
            '- Free study time\n' +
            '\n' +
            '### 2026-04-26 (Sunday)\n' +
            '- Rest day\n' +
            '\n' +
            '### 2026-04-27 (Monday)\n' +
            '- Free study time\n' +
            '\n' +
            'Notice: PART 1 is one line, PART 2 is a small factual list, PART 3 has ONE bullet per day. Follow this density. No closing remark after PART 3.';
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
