/**
 * Feature Shelf - Lateral Dashboard Controller (Instance-Aware)
 * =================================================================
 * Manages the feature shelf panel (sliding drawer) interactions.
 * Now instance-aware: buttons carry data-instance-id, and page
 * visibility is driven by data-feature-mods (template IDs).
 * =================================================================
 */

import { playAudio } from "./audio.js";
import { ModState } from "./mod-state.js";
import { getAllTemplates, getInstances } from "../mods/mod-loader.js";
import { createModContext } from "./mod-context.js";

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
 * Resolve the shelf panel ID for a given feature button element.
 * Reads the instance ID, looks up template's shelfPanelId.
 */
function resolveShelfId($btn) {
    const instanceId = $btn.dataset.instanceId;
    if (!instanceId) return $btn.dataset.featureBtn;

    const instance = ModState.getInstance(instanceId);
    if (!instance) return $btn.dataset.featureBtn;

    const templates = getAllTemplates();
    const template = templates.find(t => t.id === instance.templateId);
    return template?.shelfPanelId || $btn.dataset.featureBtn;
}

/**
 * Update feature button visibility per page (instance-aware).
 * Visibility is derived from each template's `pages` declaration —
 * a button is shown on a page if that page key exists in the template's
 * `pages` object. No HTML data-feature-mods attribute needed.
 */
function updateFeatureButtons(page) {
    const $btns = getFeatureBtns();

    $btns.forEach($btn => {
        const instanceId = $btn.dataset.instanceId;
        if (!instanceId) {
            $btn.style.display = 'none';
            return;
        }

        const instance = ModState.getInstance(instanceId);
        if (!instance) {
            $btn.style.display = 'none';
            return;
        }

        const template = getAllTemplates().find(t => t.id === instance.templateId);

        // Derive allowed pages from template.pages keys
        const templatePages = template?.pages;
        const templateAllowed = !templatePages                  // no pages → show everywhere
            || Object.keys(templatePages).length === 0          // empty pages → show everywhere
            || (page && templatePages[page] !== undefined);     // page listed → show

        $btn.style.display = templateAllowed ? '' : 'none';
    });
}

window.addEventListener('navi:pageChanged', ({ detail }) => {
    updateFeatureButtons(detail.page);
});

// Re-evaluate after MODs are loaded and DOM is populated
window.addEventListener('mods:loaded', () => {
    const activePage = document.querySelector('.page.active');
    if (activePage) updateFeatureButtons(activePage.dataset.page);
});

// Re-evaluate after instances are added/removed/reordered
window.addEventListener('mods:instanceAdded', () => {
    const activePage = document.querySelector('.page.active');
    if (activePage) updateFeatureButtons(activePage.dataset.page);
});

window.addEventListener('mods:instanceRemoved', () => {
    const activePage = document.querySelector('.page.active');
    if (activePage) updateFeatureButtons(activePage.dataset.page);
});

window.addEventListener('mods:reordered', () => {
    const activePage = document.querySelector('.page.active');
    if (activePage) updateFeatureButtons(activePage.dataset.page);
});

// Re-evaluate after buttons are rebuilt (ADD/REORDER recreates DOM)
window.addEventListener('mods:buttonsRebuilt', () => {
    const activePage = document.querySelector('.page.active');
    if (activePage) updateFeatureButtons(activePage.dataset.page);
});

/**
 * Feature button click dispatch (instance-aware).
 */
function handleFeatureBtnClick($clickedBtn) {
    const targetFeatureId = $clickedBtn.dataset.featureBtn;
    const instanceId = $clickedBtn.dataset.instanceId;
    if (!targetFeatureId) return;

    // Find the instance and its template
    const instance = instanceId ? ModState.getInstance(instanceId) : null;
    const activePage = document.querySelector('.page.active');

    if (instance) {
        const templates = getAllTemplates();
        const template = templates.find(t => t.id === instance.templateId);
        if (template && typeof template.activate === 'function') {
            const ctx = createModContext({
                instanceId: instance.instanceId,
                templateId: instance.templateId,
                page: activePage?.dataset?.page || null,
                buttonId: targetFeatureId,
                config: instance.config,
                template,
            });
            template.activate(ctx);
        }
    }

    // Resolve shelf panel (if any) and open it
    const resolvedId = resolveShelfId($clickedBtn);
    const $targetShelf = document.querySelector(`.feature-shelf[data-feature-shelf="${resolvedId}"]`);
    if (!$targetShelf) return; // No shelf — template was already activated above

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

export function openShelf() {
    playAudio("UISelectOn.mp3");
    updateShelfTransform(calculateMaxOpenPx());
}

export function closeShelf() {
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
