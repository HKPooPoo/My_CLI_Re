/**
 * Press Start Overlay - Entry & Standby Manager
 * =================================================================
 * 介紹：負責系統的進入螢幕 (Splash Screen) 與休眠/恢復動畫。
 * 職責：
 * 1. 攔截初始交互：確保用戶在進入系統前有一次點擊，以解開瀏覽器的音效限制。
 * 2. 指標恢復：在第一次點擊後，自動從 LocalStorage 恢復上次導航到的頁面。
 * 3. CRT 開關機動畫：實作 `crt-switch-on` 與 `crt-switch-off` 的視覺效果。
 * 4. 休眠邏輯：當頁面失去焦點 (Blur) 長時間後，自動進入螢幕保護狀態。
 * 依賴：navi.js, crt-vfx.css
 * =================================================================
 */

import { setActiveNaviItem, updateNaviPosition } from "./navi.js";

const overlay = document.getElementById("press-start-overlay");

// --- 狀態變數 ---
let justGainedFocus = false;
let focusTimer;
let firstTriggered = false;

/**
 * 焦點安全鎖：防止在切換視窗時意外觸發點擊事件
 */
window.addEventListener("focus", () => {
    justGainedFocus = true;
    clearTimeout(focusTimer); // 恢復焦點後取消休眠計時
    setTimeout(() => { justGainedFocus = false; }, 200);
});

/**
 * 進入系統點擊
 * 步驟：1. 檢查是否具備互動條件 2. 觸發「關機」動畫 (視覺上是關掉 Overlay) 3. 恢復導航狀態
 */
overlay.addEventListener("click", () => {
    if (!overlay.style.display === "flex" || justGainedFocus) return;

    overlay.classList.add("crt-switch-off");

    // 首次進入初始化：從儲存中找回上次頁面，若無則預設導航至 blackboard
    if (!firstTriggered) {
        if (!localStorage.getItem("navi-item-head")) {
            localStorage.setItem("navi-item-head", "blackboard");
        }

        const lastNaviItem = localStorage.getItem("navi-item-head");
        const $targetItem = document.querySelector(`.navi-item[data-navi-item="${lastNaviItem}"]`);

        if ($targetItem) {
            setActiveNaviItem($targetItem);
            updateNaviPosition(lastNaviItem);
        }
        firstTriggered = true;
    }
});

/**
 * 動態類別清理 (動畫結束監聽)
 */
overlay.addEventListener("animationend", () => {
    if (overlay.classList.contains("crt-switch-on")) {
        overlay.classList.remove("crt-switch-on");
    } else if (overlay.classList.contains("crt-switch-off")) {
        overlay.classList.remove("crt-switch-off");
        overlay.style.display = "none"; // 徹底隱藏層級
    }
});

/**
 * 休眠進入 (螢幕保護邏輯)
 */
window.addEventListener("blur", () => {
    if (overlay.style.display === "flex") return;

    // 當離開頁面時間超過設定值時，恢復 Press Start 螢幕
    focusTimer = setTimeout(() => {
        overlay.classList.add("crt-switch-on");
        overlay.style.display = "flex";
    }, 60000); // 預設 60 秒
});