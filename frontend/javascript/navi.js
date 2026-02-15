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
    $subNaviTrack.addEventListener("touchstart", (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    // 子導航觸控滑動 (End)
    $subNaviTrack.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        handleSubNaviSwipe(touchStartX, touchEndX);
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
 * 持久化：存入 LocalStorage 供頁面刷新後恢復
 */
function saveNaviItemPositionToLocalStorage() {
    if (activeNaviItem) localStorage.setItem("navi-item-head", activeNaviItem);
}

/**
 * 更新導航位置 (物理渲染)
 * 步驟：1. 計算 OffsetLeft 和位移量 2. 應用 CSS Transform 3. 高亮選中項 4. 切換 Page 5. 觸發震動效果
 */
export function updateNaviPosition($naviItem, silent = false) {
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

    // 計算居中對齊位移
    let offsetLeft = 0;
    for (let i = 0; i < subNaviHeadIndex; i++) {
        offsetLeft += $subNaviItems[i].offsetWidth + 32; // 32px 為 navi.css 定義的間隔
    }

    const currentHeadSubNaviItemWidth = $subNaviItems[subNaviHeadIndex].offsetWidth;
    const offsetSummation = offsetLeft + (currentHeadSubNaviItemWidth / 2);
    const translateX = -offsetSummation;

    $subNaviTrack.style.transform = `translateX(${translateX}px)`;

    // 高亮對應文字
    Array.from($subNaviItems).forEach(($focusedSubNaviItem, index) => {
        if (index === subNaviHeadIndex) {
            $focusedSubNaviItem.classList.add("crt-text-orange");
        } else {
            $focusedSubNaviItem.classList.remove("crt-text-orange");
        }
    });

    // 同步更新視圖頁面
    updatePage($subNaviItems[subNaviHeadIndex].dataset.subNaviItem);

    // 觸發 CRT 抖動特效 (Glitch Effect)
    const $noiseLayer = document.getElementsByClassName("crt-noise-layer")[0];
    if ($noiseLayer) {
        $noiseLayer.classList.remove("glitchEffect");
        void $noiseLayer.offsetWidth; // 強制重繪
        $noiseLayer.classList.add("glitchEffect");
        setTimeout(() => { $noiseLayer.classList.remove("glitchEffect") }, 1200);
    }

    saveNaviItemPositionToLocalStorage();
}

/**
 * 滾輪處理邏輯
 */
const $subNaviIndicatorMask = document.querySelector(".sub-navi-indicator-mask");
$subNaviIndicatorMask.addEventListener("wheel", handleSubNaviScroll, { passive: false });

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

// --- 頁面調度系統 ---
let $activePage = null;
const $pageContainer = document.getElementById("page-container");
const $pushBtn = $pageContainer.querySelector(".push-btn");
const $pullBtn = $pageContainer.querySelector(".pull-btn");
const $headIndicator = $pageContainer.querySelector(".head-indicator");
const $featureScaffold = $pageContainer.querySelector(".feature-container");

/**
 * 更新展現內容 (Page)
 * 邏輯：根據子導航標籤顯隱對應 .page DOM，並根據頁面屬性控制按鈕欄的開關位置。
 */
function updatePage(subNaviItem) {
    Array.from(document.getElementsByClassName("page")).forEach($page => {
        if (subNaviItem === $page.dataset.page) {
            $page.classList.add("active");
            $activePage = $page;

            // PUSH/PULL 按鈕欄動態位移 (只有具備 can-push-pull 類別的頁面才顯示)
            if ($page.classList.contains("can-push-pull")) {
                $pushBtn.style.transform = "translateY(0)";
                $pullBtn.style.transform = "translateY(0)";
                $featureScaffold.style.transform = "translateX(0)";
            } else {
                $pushBtn.style.transform = "translateY(-256%)";
                $pullBtn.style.transform = "translateY(256%)";
                $featureScaffold.style.transform = "translateX(256%)";
            }

            // 分支指標位移
            if ($page.classList.contains("show-branch")) {
                $headIndicator.style.transform = "translateX(0)";
            } else {
                $headIndicator.style.transform = "translateX(-256%)";
            }
        } else {
            $page.classList.remove("active");
        }
    });
}

// --- 全域事件應選 ---
window.addEventListener("resize", () => {
    if (activeNaviItem && stateOfEachNaviItem[activeNaviItem]) {
        updateNaviPosition(activeNaviItem, true); // 窗口縮放後修正位置但不播音
    }
});

// --- 觸控滑動處理 (Mobile Support) ---
let touchStartX = 0;
let $subNaviMask = document.getElementsByClassName("sub-navi-indicator-mask")[0];

$subNaviMask.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

$subNaviMask.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    handleSubNaviSwipe(touchStartX, touchEndX);
});

function handleSubNaviSwipe(startX, endX) {
    if (!activeNaviItem) return;
    const threshold = 50;
    const distance = startX - endX;

    if (Math.abs(distance) < threshold) return;

    const direction = distance > 0 ? 1 : -1;
    moveSubNaviItemHead(activeNaviItem, stateOfEachNaviItem[activeNaviItem].subNaviHeadIndex + direction);
    updateNaviPosition(activeNaviItem);
}