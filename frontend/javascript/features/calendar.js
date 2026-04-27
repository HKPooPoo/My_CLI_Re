/**
 * Feature: Calendar — polymorphic on page + incremental list editor.
 *
 * Data model (NEW — was flat strings, now arrays):
 *     { "YYYY-MM-DD": ["event 1", "event 2", ...] }
 * One-line strings per entry. No line breaks within an entry.
 * Array semantics = merge is trivial concatenation.
 *
 * BB (Notebook page):
 *     Merges the user's personal calendar (editable) with every
 *     SUBSCRIBED channel's calendar (read-only). Both sources are
 *     labelled per-item so the user sees who posted what.
 *     Personal source = users.settings.calendar (synced per-edit).
 *     Subscribed source = broadcast_channels[*].calendar from
 *     BroadcastService.listChannels() (snapshot at shelf open).
 *
 * BC (Announce channel page):
 *     One source = the channel's own calendar.
 *     Owner sees + edits via BCMeta (local IDB); cast bundles it.
 *     Subscriber sees via BroadcastCalendarService.fetch (read-only).
 *
 * Title format:
 *     BB → "{uid} CALENDAR"
 *     BC → "{CHANNEL NAME} CALENDAR"
 *
 * Day cell shows the event count (or colored dots when mixed sources),
 * not a single dot — info density for the LMS-grade UX.
 */

import { getSetting, setSetting } from '../sync-service.js';
import { BCChannel } from '../broadcast-channel.js';
import { BCMeta } from '../broadcast-db.js';
import { BroadcastService } from '../services/broadcast-service.js';
import { BroadcastCalendarService } from '../services/broadcast-calendar-service.js';
import { BBMessage } from '../blackboard-msg.js';

const ICON_URL = '/images/calendar.svg';
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Data helpers ───────────────────────────────────────────────────

/** Normalise raw stored value → array of non-empty string entries.
 * Backwards compat: older rows stored a single string per date. */
function normalizeDay(raw) {
    if (Array.isArray(raw)) {
        return raw.map(s => typeof s === 'string' ? s.trim() : '').filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim()) {
        return [raw.trim()];
    }
    return [];
}

/**
 * Normalise an entire dict → { date: [string, ...] }
 *
 * Accepts objects OR JSON strings (the channel list endpoint uses
 * DB::table query builder, which does NOT auto-decode JSONB columns;
 * the raw `calendar` value arrives as a string on the wire).
 */
function normalizeDict(raw) {
    const out = {};
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { return out; }
    }
    if (!raw || typeof raw !== 'object') return out;
    for (const [date, val] of Object.entries(raw)) {
        const items = normalizeDay(val);
        if (items.length) out[date] = items;
    }
    return out;
}

function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function todayYmd() { return ymd(new Date()); }

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[c]);
}

// ── Mode resolution ───────────────────────────────────────────────

/**
 * Returns a mode object:
 *   {
 *     kind, title, writable,
 *     load() → Promise<{ date: [{text, source, editable, sourceIdx}] }>
 *     addSelfItem(date, text) → Promise<void>
 *     removeSelfItem(date, sourceIdx) → Promise<void>
 *   }
 *
 * `sourceIdx` indexes INTO THE EDITABLE SELF ARRAY. Read-only items
 * have editable=false and sourceIdx=null; they cannot be removed here.
 */
function resolveMode() {
    const page = document.querySelector('.page.active')?.dataset.page;

    if (page === 'broadcast-channel') {
        const channel = BCChannel?.currentChannel;
        const localId = channel?.localId ?? null;
        const serverChannelId = channel?.serverChannelId ?? null;
        const channelName = channel?.name || '';
        const isOwner = !!BCChannel?.isOwnerMode;

        return {
            kind: isOwner ? 'bc-owner' : 'bc-subscriber',
            title: channelName ? `${channelName.toUpperCase()} CALENDAR` : 'CHANNEL CALENDAR',
            writable: isOwner,
            async load() {
                let dict = {};
                if (isOwner) {
                    if (localId) dict = normalizeDict(await BCMeta.getCalendar(localId));
                } else if (serverChannelId) {
                    try {
                        const data = await BroadcastCalendarService.fetch(serverChannelId);
                        dict = normalizeDict(data?.calendar);
                    } catch (e) {
                        console.error('[calendar/bc-sub] fetch failed:', e);
                    }
                }
                // One-source view — decorate with source metadata.
                const merged = {};
                const sourceLabel = channelName || 'channel';
                for (const [date, items] of Object.entries(dict)) {
                    merged[date] = items.map((text, idx) => ({
                        text,
                        source: sourceLabel,
                        editable: isOwner,
                        sourceIdx: isOwner ? idx : null,
                    }));
                }
                return merged;
            },
            async addSelfItem(date, text) {
                if (!isOwner || !localId) return;
                const cur = normalizeDict(await BCMeta.getCalendar(localId));
                if (!cur[date]) cur[date] = [];
                cur[date].push(text);
                try {
                    await BCMeta.setCalendar(localId, cur);
                } catch (e) {
                    console.error('[calendar/bc-owner] save failed:', e);
                    BBMessage.error('CHANNEL CALENDAR SAVE FAILED');
                }
            },
            async removeSelfItem(date, sourceIdx) {
                if (!isOwner || !localId) return;
                const cur = normalizeDict(await BCMeta.getCalendar(localId));
                const arr = cur[date];
                if (!arr || sourceIdx == null || sourceIdx < 0 || sourceIdx >= arr.length) return;
                arr.splice(sourceIdx, 1);
                if (arr.length === 0) delete cur[date];
                try {
                    await BCMeta.setCalendar(localId, cur);
                } catch (e) {
                    console.error('[calendar/bc-owner] save failed:', e);
                }
            },
        };
    }

    // BB mode — merge personal + all subscribed channels.
    const uid = localStorage.getItem('currentUser') || '';
    return {
        kind: 'bb',
        title: uid ? `${uid.toUpperCase()} CALENDAR` : 'CALENDAR',
        writable: true,
        async load() {
            // Self (editable)
            const selfDict = normalizeDict(getSetting('calendar', {}));
            const merged = {};
            for (const [date, items] of Object.entries(selfDict)) {
                merged[date] = items.map((text, idx) => ({
                    text,
                    source: 'self',
                    editable: true,
                    sourceIdx: idx,
                }));
            }
            try {
                const data = await BroadcastService.listChannels();
                const channels = (data?.channels || []).filter(c => c.is_pinned);
                for (const ch of channels) {
                    const dict = normalizeDict(ch.calendar);
                    for (const [date, items] of Object.entries(dict)) {
                        if (!merged[date]) merged[date] = [];
                        for (const text of items) {
                            merged[date].push({
                                text,
                                source: ch.name,
                                editable: false,
                                sourceIdx: null,
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn('[calendar/bb] channel list fetch failed — showing self only:', e);
            }
            return merged;
        },
        async addSelfItem(date, text) {
            const cur = normalizeDict(getSetting('calendar', {}));
            if (!cur[date]) cur[date] = [];
            cur[date].push(text);
            setSetting('calendar', cur);
        },
        async removeSelfItem(date, sourceIdx) {
            const cur = normalizeDict(getSetting('calendar', {}));
            const arr = cur[date];
            if (!arr || sourceIdx == null || sourceIdx < 0 || sourceIdx >= arr.length) return;
            arr.splice(sourceIdx, 1);
            if (arr.length === 0) delete cur[date];
            setSetting('calendar', cur);
        },
    };
}

// ── Shelf state (per-instance) ────────────────────────────────────

let $title = null;
let $monthLabel = null;
let $grid = null;
let $editor = null;
let $editorLabel = null;
let $editorList = null;
let $editorInput = null;
let $addBtn = null;

let mode = null;
let merged = {};
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let selectedYmd = null;

// ── Rendering ─────────────────────────────────────────────────────

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
    for (const w of WEEKDAY_LABELS) html += `<div class="cal-cell cal-head">${w}</div>`;
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
                const items = merged[dateStr] || [];
                const count = items.length;
                const hasSelf = items.some(i => i.source === 'self');
                const hasChannel = items.some(i => i.source !== 'self');
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedYmd;

                const classes = [
                    'cal-cell', 'cal-day',
                    count > 0 ? 'has-event' : '',
                    isToday ? 'is-today' : '',
                    isSelected ? 'is-selected' : '',
                ].filter(Boolean).join(' ');

                // Density markers: numeric count + colour dots per source
                let markers = '';
                if (count > 0) {
                    markers += `<div class="cal-day-count">${count}</div>`;
                    markers += '<div class="cal-day-dots">';
                    if (hasSelf)    markers += '<span class="cal-dot cal-dot-self"></span>';
                    if (hasChannel) markers += '<span class="cal-dot cal-dot-channel"></span>';
                    markers += '</div>';
                }

                html += `<div class="${classes}" data-date="${dateStr}">
                    <div class="cal-day-num">${dayNum}</div>
                    ${markers}
                </div>`;
                dayNum++;
            }
        }
        html += '</div>';
    }

    $grid.innerHTML = html;
}

function renderEditorFor(dateStr) {
    const items = merged[dateStr] || [];
    const [y, m, d] = dateStr.split('-');
    const niceDate = `${MONTH_LABELS[parseInt(m)-1]} ${parseInt(d)}, ${y}`;
    $editorLabel.textContent = niceDate;

    if (items.length === 0) {
        $editorList.innerHTML = '<div class="cal-editor-empty">No events yet.</div>';
    } else {
        $editorList.innerHTML = items.map((it, i) => {
            const sourceLabel = it.source === 'self' ? '' : escapeHtml(it.source);
            const removeBtn = it.editable
                ? `<button class="cal-item-remove" type="button" data-source-idx="${it.sourceIdx}" aria-label="Remove">×</button>`
                : '';
            const classes = [
                'cal-editor-item',
                it.editable ? 'is-self' : 'is-channel',
            ].join(' ');
            return `
                <div class="${classes}" data-render-idx="${i}">
                    <div class="cal-item-text">${escapeHtml(it.text)}</div>
                    ${sourceLabel ? `<div class="cal-item-source">${sourceLabel}</div>` : ''}
                    ${removeBtn}
                </div>
            `;
        }).join('');
    }

    // Show add-row only for modes that have a writable source
    const addRow = $editor.querySelector('.cal-editor-add-row');
    if (addRow) addRow.style.display = mode?.writable ? '' : 'none';

    $editor.classList.add('active');
}

function hideEditor() {
    selectedYmd = null;
    $editor.classList.remove('active');
    renderMonth();
}

// ── Reload helpers ────────────────────────────────────────────────

async function reload() {
    if (!mode) return;
    merged = await mode.load();
    renderMonth();
    if (selectedYmd) renderEditorFor(selectedYmd);
}

// ── Event handlers ────────────────────────────────────────────────

function handleGridClick(e) {
    const cell = e.target.closest('.cal-day');
    if (!cell) return;
    const dateStr = cell.dataset.date;
    if (!dateStr) return;
    if (selectedYmd === dateStr) {
        hideEditor();
        return;
    }
    selectedYmd = dateStr;
    renderEditorFor(dateStr);
    renderMonth();
}

async function handleListClick(e) {
    const rm = e.target.closest('.cal-item-remove');
    if (!rm) return;
    const idx = parseInt(rm.dataset.sourceIdx, 10);
    if (Number.isNaN(idx) || !selectedYmd || !mode?.writable) return;
    await mode.removeSelfItem(selectedYmd, idx);
    await reload();
}

async function handleAdd() {
    if (!$editorInput || !selectedYmd || !mode?.writable) return;
    const text = $editorInput.value.trim();
    if (!text) return;
    await mode.addSelfItem(selectedYmd, text);
    $editorInput.value = '';
    await reload();
    $editorInput.focus();
}

function handleInputKey(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
    }
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

// React to settings sync (BB calendar arrived from another device)
window.addEventListener('settings:synced', () => {
    if (!$grid || mode?.kind !== 'bb') return;
    reload();
});

window.addEventListener('auth:updated', () => {
    if ($editor) hideEditor();
});

// ── Feature contract ──────────────────────────────────────────────

export const feature = {
    id: 'calendar',
    iconUrl: ICON_URL,
    pages: ['blackboard-log', 'broadcast-channel'],
    hasShelf: true,
    shouldShow(page) {
        // BB: always when logged in (overlay handles the login gate).
        // BC: any subscriber or owner with a channel context.
        if (page === 'broadcast-channel') {
            const ch = BCChannel?.currentChannel;
            if (!ch) return false;
            if (BCChannel?.isOwnerMode) return !!ch.localId;
            return !!ch.serverChannelId;
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
                    <div class="cal-editor-list"></div>
                    <div class="cal-editor-add-row">
                        <input type="text" class="cal-editor-input" placeholder="Add event…" maxlength="120">
                        <button class="cal-editor-add-btn" type="button">ADD</button>
                    </div>
                </div>
            </div>
        `;

        $title          = $shelf.querySelector('.feature-title');
        $monthLabel     = $shelf.querySelector('.cal-month-label');
        $grid           = $shelf.querySelector('.cal-grid');
        $editor         = $shelf.querySelector('.cal-editor');
        $editorLabel    = $shelf.querySelector('.cal-editor-label');
        $editorList     = $shelf.querySelector('.cal-editor-list');
        $editorInput    = $shelf.querySelector('.cal-editor-input');
        $addBtn         = $shelf.querySelector('.cal-editor-add-btn');

        $grid.addEventListener('click', handleGridClick);
        $editorList.addEventListener('click', handleListClick);
        $addBtn.addEventListener('click', handleAdd);
        $editorInput.addEventListener('keydown', handleInputKey);
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
        merged = {};
        renderMonth();
        await reload();
    },
};
