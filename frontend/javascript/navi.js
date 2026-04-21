/**
 * Global Navigation System
 * =================================================================
 * 介紹：負責管理項目的分層導航邏輯 (Main Navi & Sub Navi)。
 * 職責：
 * 1. 管理導航項目的「選取狀態」與「物理滾動位移 (TranslateX)」。
 * 2. 實作 CRT 滑動效果：當子導航切換時，觸發螢幕抖動 (Glitch) 與雜訊動畫。
 * 3. 頁面調度：根據導航選擇同步顯隱 Page Container 內的對應頁面。
 * 4. 支援多種輸入：點擊、鼠標滾輪、移動端觸控滑動 (Swipe)。
 * 依賴：audio.js
 * =================================================================
 */

import { playAudio } from "./audio.js";
import { T } from "./timing.js";

// --- 靜態引用 ---
const $allNaviItems = document.getElementsByClassName("navi-item");
let activeNaviItem = null;
const stateOfEachNaviItem = {}; // 儲存各個大導航項目的專屬子狀態 (快取位置等)

// --- 初始化導航字典與事件 ---
// 步驟：遍歷 DOM -> 建立字典 -> 綁定主/子導航點擊、滾動與觸控事件
Array.from($allNaviItems).forEach($naviItem => {
    const thisNaviItem = $naviItem.dataset.naviItem;
    const $subNaviTrack = $naviItem.querySelector(".sub-navi-track");
    const $subNaviItems = $naviItem.getElementsByClassName("sub-navi-item");

    stateOfEachNaviItem[thisNaviItem] = {
        footPrint: false,           // 是否已開啟過
        thisNaviItem: thisNaviItem, // 標籤名稱
        subNaviHeadIndex: 0,        // 當前子導航指向位置
        $subNaviTrack: $subNaviTrack,
        $subNaviItems: $subNaviItems,
        subNaviItemAmount: $subNaviItems.length,
        $naviItem: $naviItem        // 存回 DOM 引用以便播放音效
    };

    // 主導航點擊
    $naviItem.addEventListener("click", () => {
        setActiveNaviItem($naviItem);
        updateNaviPosition(thisNaviItem, true); // 靜音父項
    });

    // 子導航項目點擊
    Array.from($subNaviItems).forEach(($subNaviItem, index) => {
        $subNaviItem.addEventListener("click", (e) => {
            e.stopPropagation(); // 阻止事件冒泡到父項
            moveSubNaviItemHead(thisNaviItem, index);
            updateNaviPosition(thisNaviItem);
        });
    });

    // 子導航軌道滾輪監聽
    $subNaviTrack.addEventListener("wheel", handleSubNaviScroll, { passive: false });

    // 子導航觸控滑動 (Start)
    let trackSwipeStartTime = 0;
    $subNaviTrack.addEventListener("touchstart", (e) => {
        touchStartX = e.changedTouches[0].screenX;
        trackSwipeStartTime = Date.now();
    }, { passive: true });

    // 子導航觸控滑動 (End)
    $subNaviTrack.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        handleSubNaviSwipe(touchStartX, touchEndX, Date.now() - trackSwipeStartTime);
    });

    // 修補：防止軌道點擊誤觸
    $subNaviTrack.addEventListener("click", (e) => {
        e.stopPropagation();
    });
});

/**
 * 啟動主導航項
 * @param {HTMLElement} $clickedNaviItem 被點擊的元素
 * @param {boolean} silent 是否靜音
 */
export function setActiveNaviItem($clickedNaviItem, silent = false) {
    // 步驟：1. 清除所有 Active 類別 2. 為選中項加 Active 3. 播放音效 4. 更新存儲指標
    Array.from($allNaviItems).forEach($naviItem => {
        $naviItem.classList.remove("active");
    });

    $clickedNaviItem.classList.add("active");
    activeNaviItem = $clickedNaviItem.dataset.naviItem;

    if (!silent) {
        playAudio($clickedNaviItem.dataset.soundMain);
    }
}

/**
 * 子導航指標演進 (循環處理)
 */
function moveSubNaviItemHead($naviItem, nextSubNaviItemIndex) {
    const stateOfNaviItem = stateOfEachNaviItem[$naviItem];
    if (!stateOfNaviItem) return;

    const subNaviItemAmount = stateOfNaviItem.subNaviItemAmount;

    // 循環補齊邏輯
    if (nextSubNaviItemIndex >= subNaviItemAmount) nextSubNaviItemIndex = 0;
    else if (nextSubNaviItemIndex < 0) nextSubNaviItemIndex = subNaviItemAmount - 1;

    stateOfNaviItem.subNaviHeadIndex = nextSubNaviItemIndex;
}

/**
 * Programmatic sub-navi selection by name. Used by auth-landing to put the
 * user on a specific sub-page (e.g. "auth") without them clicking.
 */
export function setSubNaviHead(naviItem, subName) {
    const state = stateOfEachNaviItem[naviItem];
    if (!state) return false;
    const items = Array.from(state.$subNaviItems);
    const targetIndex = items.findIndex(el => el.dataset.subNaviItem === subName);
    if (targetIndex < 0) return false;
    state.subNaviHeadIndex = targetIndex;
    return true;
}

/**
 * 持久化：存入 LocalStorage 供頁面刷新後恢復
 */
function saveNaviItemPositionToLocalStorage() {
    if (activeNaviItem) localStorage.setItem("navi-item-head", activeNaviItem);
}

/**
 * 更新導航位置 (物理渲染)
 * 步驟：1. 計算 OffsetLeft 和位移量 2. 應用 CSS Transform 3. 高亮選中項 4. 切換 Page 5. 觸發震動效果
 */
export function updateNaviPosition($naviItem, silent = false, instant = false, skipPageUpdate = false) {
    const stateOfNaviItem = stateOfEachNaviItem[$naviItem];
    if (!stateOfNaviItem) return;

    if (!silent) {
        playAudio(stateOfNaviItem.$naviItem.dataset.soundSub);
    }

    if (!stateOfNaviItem.footPrint) {
        stateOfNaviItem.footPrint = true;
    }

    const subNaviHeadIndex = stateOfNaviItem.subNaviHeadIndex;
    const $subNaviItems = stateOfNaviItem.$subNaviItems;
    const $subNaviTrack = stateOfNaviItem.$subNaviTrack;

    // 計算居中對齊位移 (batch read offsetWidth to minimize reflows)
    const itemWidths = Array.from($subNaviItems).map(el => el.offsetWidth);
    let offsetLeft = 0;
    for (let i = 0; i < subNaviHeadIndex; i++) {
        offsetLeft += itemWidths[i] + 32; // 32px 為 navi.css 定義的間隔
    }

    const currentHeadSubNaviItemWidth = itemWidths[subNaviHeadIndex];
    const offsetSummation = offsetLeft + (currentHeadSubNaviItemWidth / 2);
    const translateX = -offsetSummation;

    if (instant) {
        $subNaviTrack.style.transition = 'none';
    }

    $subNaviTrack.style.transform = `translateX(${translateX}px)`;

    if (instant) {
        void $subNaviTrack.offsetWidth; // Force reflow
        $subNaviTrack.style.transition = '';
    }

    // 高亮對應文字
    Array.from($subNaviItems).forEach(($focusedSubNaviItem, index) => {
        if (index === subNaviHeadIndex) {
            $focusedSubNaviItem.classList.add("crt-text-orange");
        } else {
            $focusedSubNaviItem.classList.remove("crt-text-orange");
        }
    });

    // 同步更新視圖頁面 — skippable via `skipPageUpdate` so the resize
    // handler doesn't dispatch a spurious `navi:pageChanged`. On mobile,
    // tapping a textarea pops the software keyboard which shrinks the
    // viewport and fires `window.resize`; if we re-enter updatePage +
    // dispatch, downstream consumers (e.g. mods-manager's re-render of
    // the active config page) destroy the focused textarea DOM and the
    // keyboard dismisses instantly. Resize only needs to re-center the
    // navi track, not re-activate the page.
    if (!skipPageUpdate) {
        updatePage($subNaviItems[subNaviHeadIndex].dataset.subNaviItem);
    }

    saveNaviItemPositionToLocalStorage();
}

/**
 * 滾輪處理邏輯
 */
const $subNaviIndicatorMask = document.querySelector(".sub-navi-indicator-mask");
$subNaviIndicatorMask.addEventListener("wheel", handleSubNaviScroll, { passive: false });

let _scrollCooldown = false;
function handleSubNaviScroll(e) {
    if (!activeNaviItem) return;
    e.preventDefault();
    if (_scrollCooldown) return;

    const direction = Math.sign(e.deltaY);
    if (direction === 0) return;

    _scrollCooldown = true;
    setTimeout(() => { _scrollCooldown = false; }, T('frontend.ui.subNaviCooldown'));

    const stateOfNaviItem = stateOfEachNaviItem[activeNaviItem];
    const nextIndex = stateOfNaviItem.subNaviHeadIndex + direction;

    moveSubNaviItemHead(activeNaviItem, nextIndex);
    updateNaviPosition(activeNaviItem);
}

// --- 頁面調度系統 ---
let $activePage = null;
const $pageContainer = document.getElementById("page-container");
const $pushBtn = $pageContainer.querySelector(".push-btn");
const $pullBtn = $pageContainer.querySelector(".pull-btn");
const $headIndicator = $pageContainer.querySelector(".head-indicator");
const $featureScaffold = $pageContainer.querySelector(".feature-container");
// iOS WebKit uses scale(-1,-1) to fix writing-mode direction; this reverses the X axis,
// so the hide translateX must be positive to move the element off-screen to the left.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * 更新展現內容 (Page)
 * 邏輯：根據子導航標籤顯隱對應 .page DOM，並根據頁面屬性控制按鈕欄的開關位置。
 */
function updatePage(subNaviItem) {
    Array.from(document.getElementsByClassName("page")).forEach($page => {
        if (subNaviItem === $page.dataset.page) {
            $page.classList.add("active");
            $activePage = $page;

            // Push/Pull buttons: only on can-push-pull pages
            if ($pushBtn && $pullBtn) {
                if ($page.classList.contains("can-push-pull")) {
                    $pushBtn.style.transform = "translateY(0)";
                    $pullBtn.style.transform = "translateY(0)";
                } else {
                    $pushBtn.style.transform = "translateY(-256%)";
                    $pullBtn.style.transform = "translateY(256%)";
                }
            }

            // Feature container: visible on can-push-pull OR have-feature pages
            if ($featureScaffold) {
                if ($page.classList.contains("can-push-pull") || $page.classList.contains("have-feature")) {
                    $featureScaffold.style.transform = "translateX(0)";
                }
                // Initially invisible — no need to hide via translateX
                // else {
                //     $featureScaffold.style.transform = isIOS ? "translateX(256%)" : "translateX(256%)";
                // }
            }

            // 分支指標位移 (iOS: scale(-1,-1) reverses X axis, so use positive value to hide left)
            if ($headIndicator) {
                if ($page.classList.contains("show-branch")) {
                    $headIndicator.style.transform = "translateX(0)";
                } else {
                    $headIndicator.style.transform = isIOS ? "translateX(256%)" : "translateX(-256%)";
                }
            }
        } else {
            $page.classList.remove("active");
        }
    });

    window.dispatchEvent(new CustomEvent('navi:pageChanged', { detail: { page: subNaviItem } }));
}

// --- 全域事件應選 ---
window.addEventListener("resize", () => {
    if (activeNaviItem && stateOfEachNaviItem[activeNaviItem]) {
        // silent=true, instant=true, skipPageUpdate=true — resize only
        // needs to re-center the track; re-running updatePage on every
        // keyboard pop (which fires resize on mobile) was destroying
        // active textarea DOM via mods-manager's pageChanged listener.
        updateNaviPosition(activeNaviItem, true, true, true);
    }
});

// --- 觸控滑動處理 (Mobile Support) ---
let touchStartX = 0;
let $subNaviMask = document.getElementsByClassName("sub-navi-indicator-mask")[0];

let maskSwipeStartTime = 0;
$subNaviMask.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
    maskSwipeStartTime = Date.now();
}, { passive: true });

$subNaviMask.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    handleSubNaviSwipe(touchStartX, touchEndX, Date.now() - maskSwipeStartTime);
});

// --- Page area swipe → change sub-navi (Mobile) ---
let pageSwipeStartX = 0;
let pageSwipeStartY = 0;
let pageSwipeStartTime = 0;

$pageContainer.addEventListener('touchstart', (e) => {
    const touch = e.changedTouches[0];
    pageSwipeStartX = touch.screenX;
    pageSwipeStartY = touch.screenY;
    pageSwipeStartTime = Date.now();
}, { passive: true });

$pageContainer.addEventListener('touchend', (e) => {
    if (e.target.closest('.feature-shelf-container, .attachment-chips')) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(pageSwipeStartX - touch.screenX);
    const deltaY = Math.abs(pageSwipeStartY - touch.screenY);
    const elapsed = Date.now() - pageSwipeStartTime;

    if (elapsed > 350) return;
    if (deltaX < 80) return;
    if (deltaX < deltaY * 2) return;

    handleSubNaviSwipe(pageSwipeStartX, touch.screenX, elapsed);
});

function handleSubNaviSwipe(startX, endX, elapsed = 0) {
    if (!activeNaviItem) return;
    const threshold = 80;
    const distance = startX - endX;

    if (Math.abs(distance) < threshold) return;
    // Require deliberate swipe: reject slow drags (> 350ms)
    if (elapsed > 0 && elapsed > 350) return;

    const direction = distance > 0 ? 1 : -1;
    moveSubNaviItemHead(activeNaviItem, stateOfEachNaviItem[activeNaviItem].subNaviHeadIndex + direction);
    updateNaviPosition(activeNaviItem);
}

// --- 頁面加載時恢復導航狀態 ---
(function restoreNaviState() {
    const savedNaviItem = localStorage.getItem("navi-item-head");
    const $allItems = Array.from($allNaviItems);

    if (savedNaviItem) {
        const $matched = $allItems.find($el => $el.dataset.naviItem === savedNaviItem);
        if ($matched) {
            setActiveNaviItem($matched, true);
            updateNaviPosition(savedNaviItem, true, true);
            return;
        }
    }

    // Default to first item
    if ($allItems.length > 0) {
        setActiveNaviItem($allItems[0], true);
        updateNaviPosition($allItems[0].dataset.naviItem, true, true);
    }
})();