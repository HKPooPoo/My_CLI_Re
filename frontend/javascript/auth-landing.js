/**
 * Auth Landing — redirect logic + global auth-locked overlay.
 * =================================================================
 * Responsibilities:
 * 1. On first press-start dismiss: if not logged in, send the user to
 *    the Auth sub-page under Notebook. If logged in, restore the last
 *    visited main nav (fallback: broadcast).
 * 2. On login success: redirect to Announcement list.
 * 3. Toggle the single #auth-locked-overlay over .page-container
 *    when the user is signed out AND the active page is one that
 *    requires authentication. Nav stays outside page-container so
 *    it is never covered — user can always navigate away.
 * 4. Apply `inert` to all other page-container children when locked
 *    so F12-deleting the overlay still leaves the underlying UI
 *    non-interactive (defense in depth).
 * =================================================================
 */

import { setActiveNaviItem, updateNaviPosition, setSubNaviHead } from './navi.js';

const LOCKED_PAGES = new Set([
    'blackboard-log',      // NOTEBOOK → NOTE
    'blackboard-branch',   // NOTEBOOK → NOTEBOOKS
    'walkie-typie-list',   // CHAT → CONTACTS
    'walkie-typie-text',   // CHAT → MESSAGES
    'broadcast-channel',   // ANNOUNCE → POSTS
    'broadcast-list',      // ANNOUNCE → CHANNELS
]);

const $overlay  = document.getElementById('auth-locked-overlay');
const $container = document.querySelector('.page-container');

function checkLoggedIn() {
    const uid = localStorage.getItem('currentUser');
    return !!uid && uid !== 'local';
}

function activePageName() {
    return document.querySelector('.page.active')?.dataset.page || null;
}

function updateLockState() {
    if (!$overlay || !$container) return;
    const isLoggedIn = checkLoggedIn();
    const page = activePageName();
    const shouldLock = !isLoggedIn && page && LOCKED_PAGES.has(page);

    $overlay.classList.toggle('active', shouldLock);

    // Defense in depth: `inert` on all page-container children except the
    // overlay. `inert` is a browser-native attribute that disables all
    // pointer / keyboard / focus interaction on a subtree. Even if the
    // overlay is removed via DevTools, the underlying content stays
    // non-interactive until `inert` itself is cleared.
    Array.from($container.children).forEach(child => {
        if (child === $overlay) return;
        if (shouldLock) child.setAttribute('inert', '');
        else child.removeAttribute('inert');
    });
}

function navigateTo(naviItem, subName) {
    const $target = document.querySelector(`.navi-item[data-navi-item="${naviItem}"]`);
    if (!$target) return;
    if (subName) setSubNaviHead(naviItem, subName);
    setActiveNaviItem($target);
    updateNaviPosition(naviItem);
}

/**
 * Called by pressStart.js on first dismiss. Picks landing page based on
 * login state.
 */
export function resolveLandingNav() {
    if (!checkLoggedIn()) {
        navigateTo('blackboard', 'auth');
        return;
    }
    const last = localStorage.getItem('navi-item-head') || 'broadcast';
    navigateTo(last);
}

// Login transitions: on logged-out → logged-in, three automated actions:
//   1. BB sub-navi moves off AUTH so the user isn't stuck there when they
//      click NOTEBOOK later — it remembers NOTE (blackboard-log).
//   2. Main nav jumps to broadcast → broadcast-channel sub-page.
//   3. Dashboard auto-pop is handled in dashboard.js (sessionStorage
//      dedupes so it only runs once per session).
let _previouslyLoggedIn = checkLoggedIn();
window.addEventListener('auth:updated', () => {
    const isLoggedIn = checkLoggedIn();
    if (!_previouslyLoggedIn && isLoggedIn) {
        // Shift BB's remembered sub-navi away from AUTH before navigating
        // so a later BB main-nav click lands on NOTE, not the login page.
        setSubNaviHead('blackboard', 'blackboard-log');
        navigateTo('broadcast', 'broadcast-channel');
    }
    _previouslyLoggedIn = isLoggedIn;
    updateLockState();
});

// Re-evaluate lock on page change (a locked → unlocked navigation should
// hide the overlay, and vice versa).
window.addEventListener('navi:pageChanged', updateLockState);

// Initial sync. navi:pageChanged fires later once the user dismisses
// press-start, but do a best-effort pass now so the overlay doesn't
// flash briefly as locked if the landing page is unlocked.
updateLockState();
