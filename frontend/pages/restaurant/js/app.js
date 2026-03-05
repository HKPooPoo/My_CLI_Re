/**
 * Standalone Page Navigation
 * =================================================================
 * Lightweight version of main site's navi.js for independent pages.
 * Handles sub-navi switching, page toggling, wheel/swipe input.
 * No dependency on main site modules.
 * =================================================================
 */

// --- Static refs ---
const $allNaviItems = document.getElementsByClassName('navi-item');
let activeNaviItem = null;
const stateOfEachNaviItem = {};

// --- Init ---
Array.from($allNaviItems).forEach($naviItem => {
    const name = $naviItem.dataset.naviItem;
    const $subNaviTrack = $naviItem.querySelector('.sub-navi-track');
    const $subNaviItems = $naviItem.getElementsByClassName('sub-navi-item');

    stateOfEachNaviItem[name] = {
        name,
        subNaviHeadIndex: 0,
        $subNaviTrack,
        $subNaviItems,
        subNaviItemAmount: $subNaviItems.length,
        $naviItem,
    };

    // Main navi click
    $naviItem.addEventListener('click', () => {
        setActiveNaviItem($naviItem);
        updateNaviPosition(name, true);
    });

    // Sub-navi item clicks
    Array.from($subNaviItems).forEach(($sub, index) => {
        $sub.addEventListener('click', (e) => {
            e.stopPropagation();
            moveSubNaviItemHead(name, index);
            updateNaviPosition(name);
        });
    });

    // Wheel on track
    $subNaviTrack.addEventListener('wheel', handleWheel, { passive: false });

    // Touch swipe on track
    let touchStartX = 0;
    $subNaviTrack.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    $subNaviTrack.addEventListener('touchend', (e) => {
        handleSwipe(touchStartX, e.changedTouches[0].screenX);
    });

    // Prevent track click from bubbling to navi-item
    $subNaviTrack.addEventListener('click', (e) => e.stopPropagation());
});

function setActiveNaviItem($el) {
    Array.from($allNaviItems).forEach($n => $n.classList.remove('active'));
    $el.classList.add('active');
    activeNaviItem = $el.dataset.naviItem;
}

function moveSubNaviItemHead(naviName, nextIndex) {
    const state = stateOfEachNaviItem[naviName];
    if (!state) return;
    if (nextIndex >= state.subNaviItemAmount) nextIndex = 0;
    else if (nextIndex < 0) nextIndex = state.subNaviItemAmount - 1;
    state.subNaviHeadIndex = nextIndex;
}

/**
 * Core positioning — mirrors main navi.js algorithm:
 * accumulate (offsetWidth + 32px gap) per item, center on target.
 */
function updateNaviPosition(naviName, silent = false, instant = false) {
    const state = stateOfEachNaviItem[naviName];
    if (!state) return;

    const idx = state.subNaviHeadIndex;
    const $items = state.$subNaviItems;
    const $track = state.$subNaviTrack;

    // Batch-read widths
    const widths = Array.from($items).map(el => el.offsetWidth);
    let offsetLeft = 0;
    for (let i = 0; i < idx; i++) {
        offsetLeft += widths[i] + 32; // 32px gap from navi.css
    }
    const translateX = -(offsetLeft + widths[idx] / 2);

    if (instant) $track.style.transition = 'none';
    $track.style.transform = `translateX(${translateX}px)`;
    if (instant) {
        void $track.offsetWidth; // force reflow
        $track.style.transition = '';
    }

    // Highlight active sub-navi
    Array.from($items).forEach(($sub, i) => {
        $sub.classList.toggle('crt-text-orange', i === idx);
    });

    // Toggle pages
    updatePage($items[idx].dataset.subNaviItem);

    // CRT glitch effect
    const $noise = document.querySelector('.crt-noise-layer');
    if ($noise) {
        $noise.classList.remove('glitchEffect');
        void $noise.offsetWidth;
        $noise.classList.add('glitchEffect');
        setTimeout(() => $noise.classList.remove('glitchEffect'), 1200);
    }
}

function updatePage(subNaviItem) {
    Array.from(document.getElementsByClassName('page')).forEach($page => {
        $page.classList.toggle('active', subNaviItem === $page.dataset.page);
    });
}

// --- Wheel on indicator mask ---
const $mask = document.querySelector('.sub-navi-indicator-mask');
if ($mask) {
    $mask.addEventListener('wheel', handleWheel, { passive: false });

    let maskTouchStartX = 0;
    $mask.addEventListener('touchstart', (e) => {
        maskTouchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    $mask.addEventListener('touchend', (e) => {
        handleSwipe(maskTouchStartX, e.changedTouches[0].screenX);
    });
}

function handleWheel(e) {
    if (!activeNaviItem) return;
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    if (dir === 0) return;
    const state = stateOfEachNaviItem[activeNaviItem];
    moveSubNaviItemHead(activeNaviItem, state.subNaviHeadIndex + dir);
    updateNaviPosition(activeNaviItem);
}

function handleSwipe(startX, endX) {
    if (!activeNaviItem) return;
    const dist = startX - endX;
    if (Math.abs(dist) < 50) return;
    const dir = dist > 0 ? 1 : -1;
    const state = stateOfEachNaviItem[activeNaviItem];
    moveSubNaviItemHead(activeNaviItem, state.subNaviHeadIndex + dir);
    updateNaviPosition(activeNaviItem);
}

// --- Resize handler ---
window.addEventListener('resize', () => {
    if (activeNaviItem) updateNaviPosition(activeNaviItem, true, true);
});

// --- Boot: activate first navi item ---
(function boot() {
    const $first = $allNaviItems[0];
    if ($first) {
        setActiveNaviItem($first);
        updateNaviPosition($first.dataset.naviItem, true, true);
    }
})();
