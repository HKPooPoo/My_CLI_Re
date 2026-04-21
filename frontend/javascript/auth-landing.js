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
            const page = overlay.closest('.page');
            if (!page) return;

            // Elevate the entire .page when locked so the overlay beats
            // its siblings (feature-container, push/pull, head-indicator)
            // in the page-container stacking context. See layer.css.
            page.classList.toggle('auth-locked', !isLoggedIn);

            // Defense-in-depth: `inert` attribute on sibling content of the
            // overlay. `inert` is a browser-native attribute that disables
            // ALL pointer / keyboard / focus interaction on the subtree.
            // Even if the overlay is F12-deleted, the underlying content
            // stays non-interactive until `inert` itself is removed.
            Array.from(page.children).forEach(child => {
                if (child === overlay) return;
                if (isLoggedIn) {
                    child.removeAttribute('inert');
                } else {
                    child.setAttribute('inert', '');
                }
            });

            // Also inert the siblings of .page that sit inside page-container
            // — push/pull buttons and head-indicator live there. Without this
            // they'd still be tab-focusable even though the overlay covers
            // them visually.
            const pageContainer = page.parentElement;
            if (!pageContainer) return;
            // Only apply when THIS page is the active one; otherwise other
            // pages would incorrectly inert the shared push/pull row.
            if (!page.classList.contains('active')) return;
            const sharedSiblings = pageContainer.querySelectorAll(
                '.push-btn, .pull-btn, .head-indicator, .feature-container'
            );
            sharedSiblings.forEach(el => {
                if (isLoggedIn) el.removeAttribute('inert');
                else el.setAttribute('inert', '');
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
