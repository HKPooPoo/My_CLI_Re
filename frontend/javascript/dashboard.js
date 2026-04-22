/**
 * Dashboard — a launch-pad overlay that reuses #press-start-overlay.
 *
 * Three cards:
 *   📅 Upcoming      — next 7 days of the user's personal calendar events
 *   📢 Announcements — channels present locally (click jumps to Announce)
 *   📝 Notebooks     — BB branches present locally (click jumps to Notebook)
 *
 * Triggers:
 *   - First login of the session (sessionStorage flag) auto-opens the
 *     dashboard so the stakeholder sees "there are things here".
 *   - The HUD right-side #hud-news-badge click opens it.
 *   - The × button inside the dashboard closes it.
 *
 * Press-start-overlay states are tracked via classes on the element:
 *   default        → "TAP TO START" label visible
 *   .dashboard-mode → dashboard grid visible, label hidden
 *   display:none   → fully hidden
 */

import { setActiveNaviItem, updateNaviPosition, setSubNaviHead } from './navi.js';
import { getSetting } from './sync-service.js';
import db from './indexedDB.js';

const $overlay = document.getElementById('press-start-overlay');
const $badge   = document.getElementById('hud-news-badge');
const $calBody = document.getElementById('dashboard-calendar-body');
const $annBody = document.getElementById('dashboard-announce-body');
const $nbBody  = document.getElementById('dashboard-notebooks-body');

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isLoggedIn() {
    const uid = localStorage.getItem('currentUser');
    return !!uid && uid !== 'local';
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[c]);
}

function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function friendlyDate(ymdStr) {
    const [y, m, d] = ymdStr.split('-').map(n => parseInt(n, 10));
    const dt = new Date(y, m - 1, d);
    return `${WEEKDAY_SHORT[dt.getDay()]}, ${MONTH_SHORT[m-1]} ${d}`;
}

function navigateTo(naviItem, subName) {
    const $target = document.querySelector(`.navi-item[data-navi-item="${naviItem}"]`);
    if (!$target) return;
    if (subName) setSubNaviHead(naviItem, subName);
    setActiveNaviItem($target);
    updateNaviPosition(naviItem);
}

// ── Card renderers ────────────────────────────────────────────────

function renderCalendarCard() {
    if (!$calBody) return;
    const cal = getSetting('calendar', {}) || {};
    const today = ymd(new Date());
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const limit = ymd(in7);

    const upcoming = Object.entries(cal)
        .filter(([date]) => date >= today && date <= limit)
        .sort(([a], [b]) => a.localeCompare(b));

    if (upcoming.length === 0) {
        $calBody.innerHTML = '<div class="dashboard-empty">No events in the next 7 days.</div>';
        return;
    }

    $calBody.innerHTML = upcoming.map(([date, text]) => `
        <div class="dashboard-item" data-action="calendar" data-date="${escapeHtml(date)}">
            <div class="dashboard-item-meta">${friendlyDate(date)}</div>
            <div class="dashboard-item-text">${escapeHtml(text)}</div>
        </div>
    `).join('');
}

async function renderAnnounceCard() {
    if (!$annBody) return;
    try {
        const channels = await db.broadcast_channels.toArray();
        if (channels.length === 0) {
            $annBody.innerHTML = '<div class="dashboard-empty">No channels yet.</div>';
            return;
        }
        $annBody.innerHTML = channels
            .sort((a, b) => (b.last_signal || 0) - (a.last_signal || 0))
            .slice(0, 6)
            .map(ch => `
                <div class="dashboard-item" data-action="announce" data-channel-id="${escapeHtml(ch.local_id)}">
                    <div class="dashboard-item-text">${escapeHtml(ch.name || 'Untitled channel')}</div>
                    <div class="dashboard-item-meta">${ch.server_channel_id ? 'POSTED' : 'DRAFT'}</div>
                </div>
            `).join('');
    } catch (e) {
        console.error('[dashboard] announce load failed:', e);
        $annBody.innerHTML = '<div class="dashboard-empty">Could not load channels.</div>';
    }
}

async function renderNotebooksCard() {
    if (!$nbBody) return;
    try {
        // Group BB records by branch_id, pick the most recent branch_name per group.
        const all = await db.blackboard.toArray();
        const byBranch = new Map();
        for (const r of all) {
            const bid = r.branch_id;
            if (!bid) continue;
            const prev = byBranch.get(bid);
            if (!prev || (r.timestamp || 0) > (prev.latestTs || 0)) {
                byBranch.set(bid, {
                    branchId: bid,
                    branchName: r.branch || prev?.branchName || 'Untitled',
                    latestTs: r.timestamp || prev?.latestTs || 0,
                    count: (prev?.count || 0) + 1,
                });
            } else {
                prev.count = (prev.count || 0) + 1;
            }
        }
        const branches = [...byBranch.values()].sort((a, b) => b.latestTs - a.latestTs);

        if (branches.length === 0) {
            $nbBody.innerHTML = '<div class="dashboard-empty">No notebooks yet.</div>';
            return;
        }

        $nbBody.innerHTML = branches.slice(0, 6).map(b => `
            <div class="dashboard-item" data-action="notebook" data-branch-id="${escapeHtml(b.branchId)}">
                <div class="dashboard-item-text">${escapeHtml(b.branchName)}</div>
                <div class="dashboard-item-meta">${b.count} ${b.count === 1 ? 'page' : 'pages'}</div>
            </div>
        `).join('');
    } catch (e) {
        console.error('[dashboard] notebooks load failed:', e);
        $nbBody.innerHTML = '<div class="dashboard-empty">Could not load notebooks.</div>';
    }
}

// ── Open / close ──────────────────────────────────────────────────

function openDashboard() {
    if (!$overlay) return;
    $overlay.classList.add('dashboard-mode');
    $overlay.style.display = 'flex';
    renderCalendarCard();
    renderAnnounceCard();
    renderNotebooksCard();
}

function closeDashboard() {
    if (!$overlay) return;
    $overlay.classList.remove('dashboard-mode');
    $overlay.style.display = 'none';
}

// ── Wiring ────────────────────────────────────────────────────────

$badge?.addEventListener('click', () => {
    openDashboard();
});

// Dashboard click handling:
//   - item click → navigate + close
//   - backdrop click (outside the card) → close (Press Start semantics)
//   - click inside the card but not an item → no-op
$overlay?.addEventListener('click', (e) => {
    if (!$overlay.classList.contains('dashboard-mode')) return;

    const item = e.target.closest('.dashboard-item');
    if (item) {
        const action = item.dataset.action;
        if (action === 'calendar') {
            navigateTo('blackboard', 'blackboard-log');
        } else if (action === 'announce') {
            navigateTo('broadcast', 'broadcast-channel');
        } else if (action === 'notebook') {
            navigateTo('blackboard', 'blackboard-branch');
        }
        closeDashboard();
        return;
    }

    // Anywhere outside the content card = backdrop, dismiss.
    if (!e.target.closest('.dashboard-label')) {
        closeDashboard();
    }
});

// Auto-pop on logged-out → logged-in transition, once per session.
let _prevLoggedIn = isLoggedIn();
window.addEventListener('auth:updated', () => {
    const now = isLoggedIn();
    if (!_prevLoggedIn && now && !sessionStorage.getItem('dashboard-shown')) {
        sessionStorage.setItem('dashboard-shown', '1');
        // Wait one tick so auth-landing's own navigation (to broadcast-list)
        // settles before we overlay the dashboard on top.
        setTimeout(openDashboard, 50);
    }
    _prevLoggedIn = now;
});

// Re-render when settings sync lands new calendar data
window.addEventListener('settings:synced', () => {
    if ($overlay?.classList.contains('dashboard-mode')) {
        renderCalendarCard();
    }
});

// HUD badge visibility mirrors login state.
function updateBadgeVisibility() {
    if (!$badge) return;
    $badge.style.display = isLoggedIn() ? '' : 'none';
}
window.addEventListener('auth:updated', updateBadgeVisibility);
updateBadgeVisibility();
