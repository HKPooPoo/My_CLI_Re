/**
 * Restaurant App — entry point
 * Initializes i18n + IndexedDB cart, boots page modules.
 * Handles URL-driven check-in and session gating.
 */

import { initI18n, t } from './i18n.js';
import { initCart } from './cart.js';
import { getSession, setSession, isCheckedIn } from './session.js';

await initI18n();
await initCart();

// --- URL-driven check-in ---
const params = new URLSearchParams(window.location.search);
const urlBranch = params.get('branch');
const urlTable = params.get('table');

if (urlBranch && urlTable && !isCheckedIn()) {
    try {
        const res = await fetch('/api/restaurant/sessions/check-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ branch_code: urlBranch, table_number: Number(urlTable) }),
        });
        if (res.ok) {
            const data = await res.json();
            setSession(data);
        }
    } catch (err) {
        console.warn('Auto check-in failed:', err);
    }
}

// Strip query params from URL
if (urlBranch || urlTable) {
    const clean = window.location.pathname;
    history.replaceState(null, '', clean);
}

// --- Session badge ---
const sessionBadge = document.getElementById('session-badge');

function updateSessionBadge() {
    const session = getSession();
    if (session && sessionBadge) {
        sessionBadge.textContent = `${session.branch_name} · Table ${session.table_number}`;
        sessionBadge.hidden = false;
    } else if (sessionBadge) {
        sessionBadge.hidden = true;
    }
}

// --- Check-in gate overlay ---
const gatedPages = ['menu', 'cart', 'recipt'];
const overlay = document.getElementById('checkin-overlay');
let currentPage = null;

function updateGate() {
    if (!overlay) return;
    const onGatedPage = gatedPages.includes(currentPage);
    overlay.hidden = !onGatedPage || isCheckedIn();
    overlay.querySelector('.checkin-overlay-text').textContent = t('session.scan-qr');
}

window.addEventListener('session:changed', () => {
    updateSessionBadge();
    updateGate();
});

window.addEventListener('navi:pageChanged', (e) => {
    currentPage = e.detail?.page;
    updateGate();
});

updateSessionBadge();

// --- Boot page modules ---
import('./menu.js');
import('./cart-page.js');
import('./receipt-page.js');
import('./kitchen-page.js');
import('./console-page.js');
