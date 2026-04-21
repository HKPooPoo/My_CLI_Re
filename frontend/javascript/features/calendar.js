/**
 * Feature: Calendar — the user's personal schedule (per-user, cross-device).
 *
 * Data lives on the server in users.settings.calendar (JSONB column,
 * auto-synced via sync-service.js). Shape: { "YYYY-MM-DD": "note", ... }.
 *
 * This is the BB-side calendar. BC channels have their own separate
 * calendar keyed per-channel (broadcast-channel backend). BB and BC
 * calendars do NOT merge — the user sees two distinct views.
 *
 * Title: "{uid} Calendar" so users always know whose calendar this is.
 */

import { getSetting, setSetting } from '../sync-service.js';

const ICON_URL = '/images/calendar.svg';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Storage helpers (delegate to sync-service) ─────────────────────

function loadEvents() {
    return { ...(getSetting('calendar', {}) || {}) };
}

function saveEvents(events) {
    setSetting('calendar', events);
}

function currentUid() {
    return localStorage.getItem('currentUser') || '';
}

function ymd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function todayYmd() {
    return ymd(new Date());
}

// ── Rendering state (per-shelf instance) ───────────────────────────

let $panel = null;
let $title = null;
let $monthLabel = null;
let $grid = null;
let $editor = null;
let $editorLabel = null;
let $editorTextarea = null;
let $saveBtn = null;
let $deleteBtn = null;

let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let selectedYmd = null;

// ── Rendering ──────────────────────────────────────────────────────

function updateTitle() {
    if (!$title) return;
    const uid = currentUid();
    $title.textContent = uid ? `${uid} CALENDAR` : 'CALENDAR';
}

function renderMonth() {
    const events = loadEvents();
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const today = todayYmd();

    $monthLabel.textContent = `${MONTH_LABELS[viewMonth]} ${viewYear}`;

    let html = '<div class="cal-row cal-row-head">';
    for (const w of WEEKDAY_LABELS) {
        html += `<div class="cal-cell cal-head">${w}</div>`;
    }
    html += '</div>';

    let dayNum = 1;
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    for (let cellIdx = 0; cellIdx < totalCells; cellIdx += 7) {
        html += '<div class="cal-row">';
        for (let col = 0; col < 7; col++) {
            const i = cellIdx + col;
            if (i < startWeekday || dayNum > daysInMonth) {
                html += '<div class="cal-cell cal-blank"></div>';
            } else {
                const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const hasEvent = !!events[dateStr];
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedYmd;
                const classes = [
                    'cal-cell', 'cal-day',
                    hasEvent ? 'has-event' : '',
                    isToday ? 'is-today' : '',
                    isSelected ? 'is-selected' : '',
                ].filter(Boolean).join(' ');
                html += `<div class="${classes}" data-date="${dateStr}">
                    <div class="cal-day-num">${dayNum}</div>
                    ${hasEvent ? '<div class="cal-day-dot"></div>' : ''}
                </div>`;
                dayNum++;
            }
        }
        html += '</div>';
    }

    $grid.innerHTML = html;
}

function showEditorFor(dateStr) {
    selectedYmd = dateStr;
    const events = loadEvents();
    const [y, m, d] = dateStr.split('-');
    const niceDate = `${MONTH_LABELS[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
    $editorLabel.textContent = niceDate;
    $editorTextarea.value = events[dateStr] || '';
    $editor.classList.add('active');
    renderMonth();
}

function hideEditor() {
    selectedYmd = null;
    $editor.classList.remove('active');
    renderMonth();
}

// ── Event handlers ─────────────────────────────────────────────────

function handleGridClick(e) {
    const cell = e.target.closest('.cal-day');
    if (!cell) return;
    const dateStr = cell.dataset.date;
    if (!dateStr) return;
    if (selectedYmd === dateStr) {
        hideEditor();
    } else {
        showEditorFor(dateStr);
    }
}

function handleSave() {
    if (!selectedYmd) return;
    const text = ($editorTextarea.value || '').trim();
    const events = loadEvents();
    if (text) {
        events[selectedYmd] = text;
    } else {
        delete events[selectedYmd];
    }
    saveEvents(events);
    hideEditor();
}

function handleDelete() {
    if (!selectedYmd) return;
    const events = loadEvents();
    delete events[selectedYmd];
    saveEvents(events);
    hideEditor();
}

function handlePrevMonth() {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    renderMonth();
}

function handleNextMonth() {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderMonth();
}

// React to cross-device sync arrivals
window.addEventListener('settings:synced', () => {
    if ($grid) renderMonth();
    if ($title) updateTitle();
});

window.addEventListener('auth:updated', () => {
    if ($title) updateTitle();
    if ($grid) renderMonth();
    if ($editor) hideEditor();
});

// ── Feature contract ───────────────────────────────────────────────

export const feature = {
    id: 'calendar',
    iconUrl: ICON_URL,
    pages: ['blackboard-log', 'broadcast-channel'],
    hasShelf: true,
    initShelf($shelf) {
        $shelf.innerHTML = `
            <div class="feature-panel" data-feature="calendar">
                <div class="feature-title"></div>
                <div class="cal-nav-row">
                    <button class="cal-nav-btn cal-prev" type="button" aria-label="Previous month">‹</button>
                    <div class="cal-month-label"></div>
                    <button class="cal-nav-btn cal-next" type="button" aria-label="Next month">›</button>
                </div>
                <div class="cal-grid"></div>
                <div class="cal-editor">
                    <div class="cal-editor-label"></div>
                    <textarea class="cal-editor-textarea" placeholder="What's happening this day?"></textarea>
                    <div class="cal-editor-actions">
                        <button class="cal-delete-btn" type="button">DELETE</button>
                        <button class="cal-save-btn" type="button">SAVE</button>
                    </div>
                </div>
            </div>
        `;

        $panel          = $shelf.querySelector('[data-feature="calendar"]');
        $title          = $shelf.querySelector('.feature-title');
        $monthLabel     = $shelf.querySelector('.cal-month-label');
        $grid           = $shelf.querySelector('.cal-grid');
        $editor         = $shelf.querySelector('.cal-editor');
        $editorLabel    = $shelf.querySelector('.cal-editor-label');
        $editorTextarea = $shelf.querySelector('.cal-editor-textarea');
        $saveBtn        = $shelf.querySelector('.cal-save-btn');
        $deleteBtn      = $shelf.querySelector('.cal-delete-btn');

        $grid.addEventListener('click', handleGridClick);
        $saveBtn.addEventListener('click', handleSave);
        $deleteBtn.addEventListener('click', handleDelete);
        $shelf.querySelector('.cal-prev').addEventListener('click', handlePrevMonth);
        $shelf.querySelector('.cal-next').addEventListener('click', handleNextMonth);

        updateTitle();
        renderMonth();
    },
    onOpen() {
        const now = new Date();
        viewYear = now.getFullYear();
        viewMonth = now.getMonth();
        selectedYmd = null;
        $editor?.classList.remove('active');
        updateTitle();
        renderMonth();
    },
};
