import { playAudio } from "./audio.js";

const $allNaviItems = document.getElementsByClassName("navi-item");

let activeNaviItem = null;

// Initialize dictionary for each naviItem
const stateOfEachNaviItem = {};

// Dictionary for each naviItem
Array.from($allNaviItems).forEach($naviItem => {
    const thisNaviItem = $naviItem.dataset.naviItem;

    const $subNaviTrack = $naviItem.querySelector(".sub-navi-track");
    const $subNaviItems = $naviItem.getElementsByClassName("sub-navi-item");

    stateOfEachNaviItem[thisNaviItem] = {
        footPrint: false, //Marking
        thisNaviItem: thisNaviItem, //Name
        subNaviHeadIndex: 0, //Head Index
        $subNaviTrack: $subNaviTrack, //Owned Track
        $subNaviItems: $subNaviItems, //Owned Items
        subNaviItemAmount: $subNaviItems.length, //Item Amount
        // this is for audio.js
        $naviItem: $naviItem
    }

    // Event
    $naviItem.addEventListener("click", (e) => {
        setActiveNaviItem($naviItem);
        updateNaviPosition(thisNaviItem, true); // silent the sub navi; father first
    })
    Array.from($subNaviItems).forEach(($subNaviItem, index) => {
        $subNaviItem.addEventListener("click", (e) => {
            e.stopPropagation(); // prevent event bubble
            moveSubNaviItemHead(thisNaviItem, index);
            updateNaviPosition(thisNaviItem)
        })
    })
    window.addEventListener("resize", () => {
        for (const naviItemName of Object.keys(stateOfEachNaviItem)) {
            if (!stateOfEachNaviItem[naviItemName].footPrint) continue;
            updateNaviPosition(naviItemName, true);
        }
    })
    // Scroll on subNaviTrack
    $subNaviTrack.addEventListener("wheel", handleSubNaviScroll, { passive: false })

    // patch
    $subNaviTrack.addEventListener("click", (e) => {
        e.stopPropagation(); // prevent event bubble
    })
})

export function setActiveNaviItem($clickedNaviItem, silent = false) {
    // deactivate all
    Array.from($allNaviItems).forEach($naviItem => {
        $naviItem.classList.remove("active");
    })

    $clickedNaviItem.classList.add("active");
    activeNaviItem = $clickedNaviItem.dataset.naviItem; //for scroll

    if (!silent) {
        playAudio($clickedNaviItem.dataset.soundMain);
    }
}

function moveSubNaviItemHead($naviItem, nextSubNaviItemIndex) {
    const stateOfNaviItem = stateOfEachNaviItem[$naviItem];

    if (!stateOfNaviItem) return;

    // Needs
    const subNaviItemAmount = stateOfNaviItem.subNaviItemAmount;
    //

    if (nextSubNaviItemIndex >= subNaviItemAmount) nextSubNaviItemIndex = 0;
    else if (nextSubNaviItemIndex < 0) nextSubNaviItemIndex = subNaviItemAmount - 1;

    stateOfNaviItem.subNaviHeadIndex = nextSubNaviItemIndex;
}

export function updateNaviPosition($naviItem, silent = false) {
    const stateOfNaviItem = stateOfEachNaviItem[$naviItem];

    if (!stateOfNaviItem) return;

    if (!silent) {
        playAudio(stateOfNaviItem.$naviItem.dataset.soundSub);
    }

    if (!stateOfNaviItem.footPrint) {
        stateOfNaviItem.footPrint = true;
    }

    //Needs
    const subNaviHeadIndex = stateOfNaviItem.subNaviHeadIndex;
    const $subNaviItems = stateOfNaviItem.$subNaviItems;
    const $subNaviTrack = stateOfNaviItem.$subNaviTrack;
    //

    let offsetLeft = 0;
    for (let i = 0; i < subNaviHeadIndex; i++) {
        offsetLeft += $subNaviItems[i].offsetWidth + 32; //margin-right = 32px <- navi.css
    }

    const currentHeadSubNaviItemWidth = $subNaviItems[subNaviHeadIndex].offsetWidth;
    const offsetSummation = offsetLeft + (currentHeadSubNaviItemWidth / 2);
    const translateX = -offsetSummation;

    $subNaviTrack.style.transform = `translateX(${translateX}px)`;

    // Update color for the focused sub-navi item; Using crt-vfx.css def class
    Array.from($subNaviItems).forEach(($focusedSubNaviItem, index) => {
        if (index === subNaviHeadIndex) {
            $focusedSubNaviItem.classList.add("crt-text-orange");
        } else {
            $focusedSubNaviItem.classList.remove("crt-text-orange");
        }
    });

    // Here updates page; supposed the name are the same
    updatePage($subNaviItems[subNaviHeadIndex].dataset.subNaviItem);

    // Here plays glitchEffect on .body
    const $noiseLayer = document.getElementsByClassName("crt-noise-layer")[0];
    if ($noiseLayer) {
        $noiseLayer.classList.remove("glitchEffect");
        void $noiseLayer.offsetWidth;
        $noiseLayer.classList.add("glitchEffect");
        setTimeout(() => { $noiseLayer.classList.remove("glitchEffect") }, 1200) //.glitchEffect def time
    }
}

// Scroll on sub-navi-indicator-mask
const $subNaviIndicatorMask = document.querySelector(".sub-navi-indicator-mask")
$subNaviIndicatorMask.addEventListener("wheel", handleSubNaviScroll, { passive: false })

// Used on sub-navi-indicator-mask AND sub-navi-track
function handleSubNaviScroll(e) {
    if (!activeNaviItem) return;

    e.preventDefault();

    const direction = Math.sign(e.deltaY);
    if (direction === 0) return;

    const stateOfNaviItem = stateOfEachNaviItem[activeNaviItem];
    const nextIndex = stateOfNaviItem.subNaviHeadIndex + direction;

    moveSubNaviItemHead(activeNaviItem, nextIndex);
    updateNaviPosition(activeNaviItem);
}

/**
 * Below is page switching logic
 */
let $activePage = null;

function updatePage(subNaviItem) {
    Array.from(document.getElementsByClassName("page")).forEach($page => {
        if (subNaviItem === $page.dataset.page) {
            $page.classList.add("active"); // defined in page.css
            $activePage = $page;
        } else {
            $page.classList.remove("active");
        }
    })
}