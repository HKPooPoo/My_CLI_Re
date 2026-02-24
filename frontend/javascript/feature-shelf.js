/**
 * Feature Shelf - Lateral Dashboard Controller
 * =================================================================
 * Manages the feature shelf panel (sliding drawer) interactions.
 * Responsibilities:
 * 1. Drawer: control slide open/close with transform.
 * 2. Draggable: horizontal drag via handle button.
 * 3. Snapping: auto-snap to nearest percentage width on drag end.
 * 4. Content dispatch: show correct shelf panel based on button click.
 * 5. MOD-aware: button visibility driven by MOD enabled state.
 *
 * DOM queries for feature-btn and feature-shelf are DYNAMIC —
 * MODs create buttons/panels at runtime via mod-loader.
 * =================================================================
 */

import { playAudio } from "./audio.js";
import { ModState } from "./mod-state.js";
import { getAllMods } from "../mods/mod-loader.js";

// --- DOM refs (static containers) ---
const $featureShelfContainer = document.querySelector('.feature-shelf-container');
const $featureShelfBackBtn = document.querySelector('.feature-shelf-back-btn');
const $featureContainer = document.querySelector('.feature-container');

// --- Drag state ---
let isDragging = false;
let dragStartX = 0;
let initialTranslateX = 0;
let currentTranslateX = 0;

const DEFAULT_OPEN_WIDTH_VW = 60;

// --- Dynamic DOM queries ---
function getFeatureBtns() {
    return $featureContainer ? $featureContainer.querySelectorAll('.feature-btn') : [];
}

function getFeatureShelves() {
    return $featureShelfContainer ? $featureShelfContainer.querySelectorAll('.feature-shelf') : [];
}

// --- Init listeners (delegated on container for dynamic buttons) ---
$featureContainer?.addEventListener('click', (e) => {
    const btn = e.target.closest('.feature-btn');
    if (!btn) return;
    playAudio("Click.mp3");
    handleFeatureBtnClick(btn);
});

// Handle drag (PC mouse)
$featureShelfBackBtn?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDrag(e.clientX);
});

// Handle drag (mobile touch)
$featureShelfBackBtn?.addEventListener('touchstart', (e) => {
    startDrag(e.touches[0].clientX);
}, { passive: false });

// Double-click to close
$featureShelfBackBtn?.addEventListener('dblclick', () => {
    playAudio("UISelectOff.mp3");
    closeShelf();
});

// Resize compensation
window.addEventListener('resize', () => {
    if (currentTranslateX === 0) return;
    snapToNearestPosition();
});

/**
 * Check if a feature button is controlled by a MOD, and if so, whether that MOD is enabled.
 */
function isFeatureBtnAllowedByMods(btnId) {
    const mods = getAllMods();
    const relatedMods = mods.filter(m =>
        m.featureButtons?.some(b => b.id === btnId)
    );
    if (relatedMods.length === 0) return true; // Not controlled by any MOD
    return relatedMods.some(m => ModState.isEnabled(m.id));
}

/**
 * Resolve the shelf panel ID for a given feature button ID.
 * Looks up the MOD that owns this button and returns its shelfPanelId.
 */
function resolveShelfId(btnId) {
    const mods = getAllMods();
    for (const mod of mods) {
        if (mod.featureButtons?.some(b => b.id === btnId)) {
            return mod.shelfPanelId || btnId;
        }
    }
    return btnId;
}

// Update feature button visibility per page (MOD-aware)
function updateFeatureButtons(page) {
    const $activePage = document.querySelector(`.page[data-page="${page}"]`);
    const featureBtns = $activePage?.dataset.featureBtns;
    const $btns = getFeatureBtns();

    if (featureBtns === undefined) {
        $btns.forEach($btn => {
            $btn.style.display = isFeatureBtnAllowedByMods($btn.dataset.featureBtn) ? '' : 'none';
        });
        return;
    }

    const allowed = featureBtns ? featureBtns.split(',') : [];
    $btns.forEach($btn => {
        const btnId = $btn.dataset.featureBtn;
        const pageAllows = allowed.includes(btnId);
        const modAllows = isFeatureBtnAllowedByMods(btnId);
        $btn.style.display = (pageAllows && modAllows) ? '' : 'none';
    });
}

window.addEventListener('navi:pageChanged', ({ detail }) => {
    updateFeatureButtons(detail.page);
});

// Re-evaluate button visibility when MOD state changes
window.addEventListener('mods:changed', () => {
    const activePage = document.querySelector('.page.active');
    if (activePage) updateFeatureButtons(activePage.dataset.page);
});

// Re-evaluate after MODs are loaded and DOM is populated
window.addEventListener('mods:loaded', () => {
    const activePage = document.querySelector('.page.active');
    if (activePage) updateFeatureButtons(activePage.dataset.page);
});

/**
 * Feature button click dispatch.
 */
function handleFeatureBtnClick($clickedBtn) {
    const targetFeatureId = $clickedBtn.dataset.featureBtn;
    if (!targetFeatureId) return;

    // Notify MOD of activation (even MODs without shelf panels)
    const mods = getAllMods();
    const activePage = document.querySelector('.page.active');
    for (const mod of mods) {
        const ownsButton = mod.featureButtons?.some(b => b.id === targetFeatureId);
        if (ownsButton && typeof mod.activate === 'function') {
            mod.activate({
                page: activePage?.dataset?.page,
                buttonId: targetFeatureId
            });
        }
    }

    // Resolve shelf panel (if any) and open it
    const resolvedId = resolveShelfId(targetFeatureId);
    const $targetShelf = document.querySelector(`.feature-shelf[data-feature-shelf="${resolvedId}"]`);
    if (!$targetShelf) return; // No shelf — MOD was already activated above

    getFeatureShelves().forEach($shelf => {
        $shelf.style.display = ($shelf === $targetShelf) ? 'flex' : 'none';
    });

    const targetOpenPx = calculateMaxOpenPx();
    if (currentTranslateX > targetOpenPx + 1) openShelf();
}

/**
 * Update shelf transform position.
 */
function updateShelfTransform(translateX) {
    currentTranslateX = translateX;
    $featureShelfContainer.style.transform = `translate3d(${translateX}px, 0, 0)`;
}

// --- Helpers ---
function getScreenWidth() {
    return Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
}

function calculateMaxOpenPx() {
    const screenWidth = getScreenWidth();
    const cssVar = getComputedStyle($featureShelfContainer).getPropertyValue('--shelf-open-width').trim();
    const widthVw = cssVar ? parseFloat(cssVar) : DEFAULT_OPEN_WIDTH_VW;
    return -1 * (widthVw / 100) * screenWidth;
}

function openShelf() {
    playAudio("UISelectOn.mp3");
    updateShelfTransform(calculateMaxOpenPx());
}

function closeShelf() {
    updateShelfTransform(0);
}

// --- Drag logic ---
function startDrag(clientX) {
    playAudio("UIPipboyOKPress.mp3");
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
    const deltaX = clientX - dragStartX;
    let newTranslateX = initialTranslateX + deltaX;

    const maxTranslate = 0;
    const minTranslate = -getScreenWidth();

    if (newTranslateX > maxTranslate) newTranslateX = maxTranslate;
    if (newTranslateX < minTranslate) newTranslateX = minTranslate;

    updateShelfTransform(newTranslateX);
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

    if (currentTranslateX === 0) {
        playAudio("UISelectOff.mp3");
    } else {
        playAudio("UIGeneralFocus.mp3");
    }
}

function snapToNearestPosition() {
    const screenWidth = getScreenWidth();
    const snapRatios = [0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const snapPositions = snapRatios.map(ratio => -1 * ratio * screenWidth);

    let closestPosition = 0;
    let minDiff = Infinity;

    snapPositions.forEach(pos => {
        const diff = Math.abs(currentTranslateX - pos);
        if (diff < minDiff) {
            minDiff = diff;
            closestPosition = pos;
        }
    });

    updateShelfTransform(closestPosition);
}
