/**
 * Auth Landing — redirect logic tied to authentication state.
 * =================================================================
 * Responsibilities:
 * 1. On first press-start dismiss: if not logged in, send the user to
 *    the Auth sub-page under Notebook main-nav. If logged in, restore
 *    the last visited nav (fallback: broadcast-list).
 * 2. On login success: redirect to Announcement list.
 * 3. Toggle the generic page-auth-overlay on locked content pages
 *    (Notebook log, Announcement channel, Announcement list) whenever
 *    the auth state flips.
 * =================================================================
 */

import { setActiveNaviItem, updateNaviPosition, setSubNaviHead } from './navi.js';

function checkLoggedIn() {
    const uid = localStorage.getItem('currentUser');
    return !!uid && uid !== 'local';
}

function updateAuthOverlays() {
    const isLoggedIn = checkLoggedIn();
    document
        .querySelectorAll('.blackboard-auth-overlay, .broadcast-auth-overlay')
        .forEach(overlay => {
            overlay.style.display = isLoggedIn ? 'none' : 'flex';
            // Defense-in-depth: apply `inert` to sibling content of the overlay.
            // `inert` is a browser-level attribute that disables ALL pointer
            // and keyboard interaction on the subtree. Even if the overlay is
            // removed via DevTools, the underlying content stays non-interactive
            // until `inert` itself is removed.
            const page = overlay.closest('.page');
            if (!page) return;
            Array.from(page.children).forEach(child => {
                if (child === overlay) return;
                if (isLoggedIn) {
                    child.removeAttribute('inert');
                } else {
                    child.setAttribute('inert', '');
                }
            });
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
 * Called by pressStart.js on first dismiss instead of the old fixed
 * "restore navi-item-head" block. Picks the landing page based on
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

// Login transitions: logged-out → logged-in should pop user to Announce.
let _previouslyLoggedIn = checkLoggedIn();
window.addEventListener('auth:updated', () => {
    const isLoggedIn = checkLoggedIn();
    if (!_previouslyLoggedIn && isLoggedIn) {
        navigateTo('broadcast', 'broadcast-list');
    }
    _previouslyLoggedIn = isLoggedIn;
    updateAuthOverlays();
});

// Initial overlay sync (pages may render before auth:updated fires)
updateAuthOverlays();
