/**
 * Feature Shelf — Scaffold & Drawer Controller
 * =================================================================
 * Owns the right-side sliding drawer. Reads features from
 * feature-registry.js, creates buttons + shelf panels on boot,
 * shows/hides buttons per active page, handles clicks + drag.
 *
 * This module is deliberately dumb: no instance model, no config,
 * no lifecycle. Each feature lives as a plain object in
 * features/<id>.js.
 * =================================================================
 */

import { playAudio } from './audio.js';
import { FEATURES, getFeature } from './feature-registry.js';

const $featureShelfContainer = document.querySelector('.feature-shelf-container');
const $featureShelfBackBtn   = document.querySelector('.feature-shelf-back-btn');
const $featureContainer      = document.querySelector('.feature-container');

const DEFAULT_OPEN_WIDTH_VW = 60;

let isDragging        = false;
let dragStartX        = 0;
let initialTranslateX = 0;
let currentTranslateX = 0;

// ── Boot: create buttons + shelf panels from registry ──

function bootstrap() {
    if (!$featureContainer || !$featureShelfContainer) return;

    // Tier 22.11 item 4: invisible spacer button at the top of the
    // feature column. Pushes the first real feature button down so it
    // sits below the DELETE PAGE / RESET editor-actions zone (top-right
    // of the editor-wrapper). Container uses justify-content: space-
    // around, so the spacer claims one slot's worth of vertical space.
    if (!$featureContainer.querySelector('.feature-btn-spacer')) {
        const spacer = document.createElement('button');
        spacer.className = 'feature-btn feature-btn-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        spacer.setAttribute('tabindex', '-1');
        $featureContainer.insertBefore(spacer, $featureShelfContainer);
    }

    for (const f of FEATURES) {
        if (!$featureContainer.querySelector(`.feature-btn[data-feature-btn="${f.id}"]`)) {
            const btn = document.createElement('button');
            btn.className = 'feature-btn';
            btn.dataset.featureBtn = f.id;
            if (f.iconUrl) btn.style.setProperty('--mod-icon-url', `url('${f.iconUrl}')`);
            // Tier 22.11 item 6: every feature button gets a hint. Use
            // the feature's explicit hintKey if provided, else derive
            // `hints.feature.{id}` which i18n resolves in default.json.
            btn.dataset.hint = f.hintKey || `hints.feature.${f.id}`;
            $featureContainer.insertBefore(btn, $featureShelfContainer);
        }

        if (f.hasShelf !== false && !$featureShelfContainer.querySelector(`[data-feature-shelf="${f.id}"]`)) {
            const shelf = document.createElement('div');
            shelf.className = 'feature-shelf';
            shelf.dataset.featureShelf = f.id;
            $featureShelfContainer.appendChild(shelf);
            if (typeof f.initShelf === 'function') {
                try { f.initShelf(shelf); }
                catch (e) { console.error(`[feature-shelf] initShelf failed for ${f.id}:`, e); }
            }
        }
    }

    const activePage = document.querySelector('.page.active');
    if (activePage) updateFeatureButtons(activePage.dataset.page);
}

// Run bootstrap when DOM ready (scripts are modules → deferred)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
    bootstrap();
}

// ── Button visibility per page ──

function updateFeatureButtons(page) {
    const $btns = $featureContainer?.querySelectorAll('.feature-btn') || [];
    $btns.forEach($btn => {
        const f = getFeature($btn.dataset.featureBtn);
        let visible = !!f && (!Array.isArray(f.pages) || f.pages.includes(page));
        // Optional per-feature runtime gate — lets features hide themselves
        // based on page-specific context (e.g. BC owner mode).
        if (visible && typeof f.shouldShow === 'function') {
            try { visible = !!f.shouldShow(page); }
            catch (e) { console.error(`[feature-shelf] shouldShow failed for ${f.id}:`, e); }
        }
        if (visible) {
            $btn.style.opacity = '';
            $btn.style.transform = '';
            $btn.style.pointerEvents = '';
        } else {
            $btn.style.opacity = '0';
            $btn.style.transform = 'translateX(128%)';
            $btn.style.pointerEvents = 'none';
        }
    });
}

window.addEventListener('navi:pageChanged', ({ detail }) => {
    updateFeatureButtons(detail.page);
});

// Re-evaluate when BC owner mode flips (e.g. user selects a channel they own
// vs one they don't). broadcast-channel.js emits this on selection change.
// Inbox emits the analogous events on inbox-list selection — whitelist
// shelf gates on `IXThread.inbox.owner_uid === currentUid`, so we have to
// re-evaluate when the active inbox changes.
['broadcast:selected', 'broadcast:cleared',
 'inbox:selected', 'inbox:cleared'].forEach(evtName => {
    window.addEventListener(evtName, () => {
        const activePage = document.querySelector('.page.active');
        if (activePage) updateFeatureButtons(activePage.dataset.page);
    });
});

// ── Click handler ──

$featureContainer?.addEventListener('click', (e) => {
    const btn = e.target.closest('.feature-btn');
    if (!btn) return;
    playAudio('Click.mp3');
    const featureId = btn.dataset.featureBtn;
    const f = getFeature(featureId);
    if (!f) return;

    if (f.hasShelf === false) {
        if (typeof f.onClick === 'function') {
            try { f.onClick(); }
            catch (e) { console.error(`[feature-shelf] onClick failed for ${featureId}:`, e); }
        }
        return;
    }

    // Open shelf and show the matching panel
    const $targetShelf = $featureShelfContainer.querySelector(`[data-feature-shelf="${featureId}"]`);
    if (!$targetShelf) return;

    $featureShelfContainer.querySelectorAll('.feature-shelf').forEach($s => {
        $s.style.display = ($s === $targetShelf) ? 'flex' : 'none';
    });

    // Tier 22.11: mark the owning button as active so its slid-out +
    // glow state remains while its shelf is the one showing.
    $featureContainer.querySelectorAll('.feature-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (typeof f.onOpen === 'function') {
        try { f.onOpen($targetShelf); }
        catch (e) { console.error(`[feature-shelf] onOpen failed for ${featureId}:`, e); }
    }

    const targetOpenPx = calculateMaxOpenPx();
    if (currentTranslateX > targetOpenPx + 1) openShelf();
});

// ── Shelf open / close ──

function updateShelfTransform(translateX) {
    if (translateX === currentTranslateX) return;
    currentTranslateX = translateX;
    $featureShelfContainer.style.transform = `translate3d(${translateX}px, 0, 0)`;
}

function getScreenWidth() {
    return Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
}

function calculateMaxOpenPx() {
    const screenWidth = getScreenWidth();
    const cssVar = getComputedStyle($featureShelfContainer).getPropertyValue('--shelf-open-width').trim();
    const widthVw = cssVar ? parseFloat(cssVar) : DEFAULT_OPEN_WIDTH_VW;
    return -1 * (widthVw / 100) * screenWidth;
}

export function openShelf() {
    playAudio('UISelectOn.mp3');
    updateShelfTransform(calculateMaxOpenPx());
}

export function closeShelf() {
    updateShelfTransform(0);
    $featureContainer?.querySelectorAll('.feature-btn').forEach(b => b.classList.remove('active'));
}

// ── Drag handlers ──

$featureShelfBackBtn?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDrag(e.clientX);
});

$featureShelfBackBtn?.addEventListener('touchstart', (e) => {
    startDrag(e.touches[0].clientX);
}, { passive: false });

$featureShelfBackBtn?.addEventListener('dblclick', () => {
    playAudio('UISelectOff.mp3');
    closeShelf();
});

let _lastScreenWidth = getScreenWidth();
window.addEventListener('resize', () => {
    const w = getScreenWidth();
    if (w === _lastScreenWidth) return;
    _lastScreenWidth = w;
    if (currentTranslateX === 0) return;
    snapToNearestPosition();
});

function startDrag(clientX) {
    playAudio('UIPipboyOKPress.mp3');
    isDragging = true;
    dragStartX = clientX;
    initialTranslateX = currentTranslateX;
    $featureShelfContainer.classList.add('no-transition');
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('touchend', handleDragEnd);
}

function handleDragMove(e) {
    if (!isDragging) return;
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const deltaX  = clientX - dragStartX;
    let newX = initialTranslateX + deltaX;
    if (newX > 0) newX = 0;
    if (newX < -getScreenWidth()) newX = -getScreenWidth();
    updateShelfTransform(newX);
}

function handleDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    $featureShelfContainer.classList.remove('no-transition');
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    window.removeEventListener('touchmove', handleDragMove);
    window.removeEventListener('touchend', handleDragEnd);
    snapToNearestPosition();
    playAudio(currentTranslateX === 0 ? 'UISelectOff.mp3' : 'UIGeneralFocus.mp3');
}

function snapToNearestPosition() {
    const screenWidth  = getScreenWidth();
    const snapRatios   = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const snapPositions = snapRatios.map(r => -1 * r * screenWidth);
    let closest = 0, minDiff = Infinity;
    for (const pos of snapPositions) {
        const diff = Math.abs(currentTranslateX - pos);
        if (diff < minDiff) { minDiff = diff; closest = pos; }
    }
    updateShelfTransform(closest);
}
