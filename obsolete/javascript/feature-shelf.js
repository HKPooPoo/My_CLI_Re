const $featureShelfContainer = document.querySelector('.feature-shelf-container');
const $featureShelfBackBtn = document.querySelector('.feature-shelf-back-btn');
const $featureBtns = document.querySelectorAll('.feature-btn');
const $featureShelves = document.querySelectorAll('.feature-shelf');

let isDragging = false;
let dragStartX = 0;
let initialTranslateX = 0;
let currentTranslateX = 0;

const DEFAULT_OPEN_WIDTH_VW = 60; // 60% viewport width

/**
 * Initialization
 */
$featureBtns.forEach($btn => {
    $btn.addEventListener('click', () => {
        handleFeatureBtnClick($btn);
    });
});

$featureShelfBackBtn.addEventListener('mousedown', (e) => {
    e.preventDefault(); // prevent text selection
    startDrag(e.clientX);
});

$featureShelfBackBtn.addEventListener('touchstart', (e) => {
    // e.preventDefault(); // prevent scrolling if necessary
    startDrag(e.touches[0].clientX);
}, { passive: false });

$featureShelfBackBtn.addEventListener('dblclick', () => {
    closeShelf();
});

// Resize observer to adjust shelf position
window.addEventListener('resize', () => {
    if (currentTranslateX === 0) return;

    // If shelf is open, snap to nearest valid position to maintain relative layout
    snapToNearestPosition();
});


/**
 * Core Logic
 */

function resolveShelfId(featureBtnId) {
    if (featureBtnId.startsWith('translate-')) return 'translator';
    return featureBtnId;
}

function handleFeatureBtnClick($clickedBtn) {
    const targetFeatureId = $clickedBtn.dataset.featureBtn;
    if (!targetFeatureId) return;

    const shelfId = resolveShelfId(targetFeatureId);
    const $targetShelf = document.querySelector(`.feature-shelf[data-feature-shelf="${shelfId}"]`);

    // Some buttons (like voice-to-text) don't have a shelf — handled by other modules
    if (!$targetShelf) return;

    // Switch visible shelf content
    $featureShelves.forEach($shelf => {
        if ($shelf === $targetShelf) {
            $shelf.style.display = 'flex';
        } else {
            $shelf.style.display = 'none';
        }
    });

    // If shelf is not sufficiently open, force open it
    const targetOpenPx = calculateMaxOpenPx();
    // Allow small buffer
    if (currentTranslateX > targetOpenPx + 1) {
        openShelf();
    }
}

function openShelf() {
    const targetPx = calculateMaxOpenPx();
    updateShelfTransform(targetPx);
}

function closeShelf() {
    updateShelfTransform(0);
}

function updateShelfTransform(translateX) {
    currentTranslateX = translateX;
    $featureShelfContainer.style.transform = `translate3d(${translateX}px, 0, 0)`;
}

// Helpers
function getScreenWidth() {
    return Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
}

function calculateMaxOpenPx() {
    const screenWidth = getScreenWidth();
    const cssVar = getComputedStyle($featureShelfContainer).getPropertyValue('--shelf-open-width').trim();
    const widthVw = cssVar ? parseFloat(cssVar) : DEFAULT_OPEN_WIDTH_VW;

    return -1 * (widthVw / 100) * screenWidth;
}


/**
 * Dragging Logic
 * Optimized: Only attach window listeners during drag
 */

function startDrag(clientX) {
    isDragging = true;
    dragStartX = clientX;
    initialTranslateX = currentTranslateX;

    $featureShelfContainer.classList.add('no-transition');

    // Attach global listeners only when dragging starts
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('touchend', handleDragEnd);
}

function handleDragMove(e) {
    if (!isDragging) return;

    // Normalize touch/mouse input
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;

    const deltaX = clientX - dragStartX;
    let newTranslateX = initialTranslateX + deltaX;

    // Boundary constraints
    const maxTranslate = 0; // Closed (Right Edge)
    const minTranslate = -getScreenWidth(); // Fully Open (Left Edge)

    if (newTranslateX > maxTranslate) newTranslateX = maxTranslate;
    if (newTranslateX < minTranslate) newTranslateX = minTranslate;

    updateShelfTransform(newTranslateX);
}

function handleDragEnd() {
    if (!isDragging) return;

    isDragging = false;
    $featureShelfContainer.classList.remove('no-transition');

    // Clean up global listeners
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    window.removeEventListener('touchmove', handleDragMove);
    window.removeEventListener('touchend', handleDragEnd);

    snapToNearestPosition();
}

function snapToNearestPosition() {
    const screenWidth = getScreenWidth();

    // Ratios representing open states (0 = Closed, 1.0 = Full Screen)
    // Added 0.2 and 0.3 to fix gap between closed and 40%
    const snapRatios = [0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

    // Convert ratios to negative pixel positions
    const snapPositions = snapRatios.map(ratio => -1 * ratio * screenWidth);

    // Find closest snap point
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
