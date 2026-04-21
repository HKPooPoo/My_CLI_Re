/**
 * Feature: Calendar — polymorphic on page.
 *
 * On Notebook (BB) pages the shelf shows the user's personal calendar,
 * stored in users.settings.calendar (synced via sync-service).
 *
 * On Announce (BC) channel pages the shelf shows the channel's
 * calendar, stored server-side in broadcast_channels.calendar. Only
 * visible to the title-owning user (`BCChannel.isOwnerMode === true`) —
 * subscribers will see it later via the Dashboard rollup, not here.
 *
 * Title format:
 *   BB → "{uid} CALENDAR"
 *   BC → "{channel name} CALENDAR"
 *
 * BB does NOT merge subscribed BC events — the two are distinct
 * surfaces per user directive.
 */

import { getSetting, setSetting } from '../sync-service.js';
import { BCChannel } from '../broadcast-channel.js';
import { BCMeta } from '../broadcast-db.js';
import { BBMessage } from '../blackboard-msg.js';

const ICON_URL = '/images/calendar.svg';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Mode resolution (BB vs BC) ─────────────────────────────────────

function getCurrentPage() {
    return document.querySelector('.page.active')?.dataset.page || null;
}

/**
 * Returns a 'mode' object describing which calendar source is active:
 *   { kind: 'bb' | 'bc', title, load(), save(events), writable }
 */
function resolveMode() {
    const page = getCurrentPage();
    if (page === 'broadcast-channel') {
        const channel = BCChannel?.currentChannel;
        const localId = channel?.localId ?? null;
        const channelName = channel?.name || '';
        return {
            kind: 'bc',
            localId,
            title: channelName ? `${channelName.toUpperCase()} CALENDAR` : 'CHANNEL CALENDAR',
            writable: !!BCChannel?.isOwnerMode,
            async load() {
                if (!localId) return {};
                try {
                    return await BCMeta.getCalendar(localId);
                } catch (e) {
                    console.error('[calendar/bc] local read failed:', e);
                    return {};
                }
            },
            async save(events) {
                if (!localId) return;
                try {
                    // Local-first: write to IndexedDB. Server sync happens
                    // when the owner casts the channel (bundled with
                    // records, same transaction).
                    await BCMeta.setCalendar(localId, events);
                } catch (e) {
                    console.error('[calendar/bc] local save failed:', e);
                    BBMessage.error('CHANNEL CALENDAR SAVE FAILED');
                }
            },
        };
    }
    // default: BB — personal calendar via sync-service
    const uid = localStorage.getItem('currentUser') || '';
    return {
        kind: 'bb',
        channelId: null,
        title: uid ? `${uid.toUpperCase()} CALENDAR` : 'CALENDAR',
        writable: true,
        async load() {
            return { ...(getSetting('calendar', {}) || {}) };
        },
        async save(events) {
            setSetting('calendar', events);
        },
    };
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

// ── Shelf DOM refs + state ─────────────────────────────────────────

let $title = null;
let $monthLabel = null;
let $grid = null;
let $editor = null;
let $editorLabel = null;
let $editorTextarea = null;
let $saveBtn = null;
let $deleteBtn = null;

let mode = null;         // resolved via resolveMode() on each onOpen()
let events = {};         // cached, loaded via mode.load()
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let selectedYmd = null;

// ── Rendering ──────────────────────────────────────────────────────

function renderTitle() {
    if ($title && mode) $title.textContent = mode.title;
}

function renderMonth() {
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
    const [y, m, d] = dateStr.split('-');
    const niceDate = `${MONTH_LABELS[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
    $editorLabel.textContent = niceDate;
    $editorTextarea.value = events[dateStr] || '';
    $editorTextarea.readOnly = !mode.writable;
    $saveBtn.style.display = mode.writable ? '' : 'none';
    $deleteBtn.style.display = mode.writable ? '' : 'none';
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

async function handleSave() {
    if (!selectedYmd || !mode?.writable) return;
    const text = ($editorTextarea.value || '').trim();
    if (text) events[selectedYmd] = text;
    else delete events[selectedYmd];
    await mode.save(events);
    hideEditor();
}

async function handleDelete() {
    if (!selectedYmd || !mode?.writable) return;
    delete events[selectedYmd];
    await mode.save(events);
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

// React to cross-device sync arrivals (BB only — BC uses per-open fetch)
window.addEventListener('settings:synced', () => {
    if (!$grid || !mode || mode.kind !== 'bb') return;
    mode.load().then(loaded => {
        events = loaded;
        renderMonth();
    });
});

window.addEventListener('auth:updated', () => {
    if ($editor) hideEditor();
});

// ── Feature contract ───────────────────────────────────────────────

export const feature = {
    id: 'calendar',
    iconUrl: ICON_URL,
    pages: ['blackboard-log', 'broadcast-channel'],
    hasShelf: true,
    shouldShow(page) {
        // On BC pages, calendar is an owner-only surface. Subscribers
        // see BC calendars via the Dashboard rollup (future tier),
        // never on the channel page itself. The button works for both
        // uncast drafts (local only) and cast channels (local + next
        // cast includes calendar in the payload).
        if (page === 'broadcast-channel') {
            return !!BCChannel?.isOwnerMode && !!BCChannel?.currentChannel?.localId;
        }
        return true;
    },
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
    },
    async onOpen() {
        mode = resolveMode();
        const now = new Date();
        viewYear = now.getFullYear();
        viewMonth = now.getMonth();
        selectedYmd = null;
        $editor?.classList.remove('active');
        renderTitle();
        // Pre-render with empty set for instant feedback, then fill.
        events = {};
        renderMonth();
        events = await mode.load();
        renderMonth();
    },
};
