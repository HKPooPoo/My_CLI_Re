/**
 * Press Start Overlay - Entry & Standby Manager
 * =================================================================
 * 介紹：負責系統的進入螢幕 (Splash Screen) 與休眠/恢復動畫。
 * 職責：
 * 1. 攔截初始交互：確保用戶在進入系統前有一次點擊，以解開瀏覽器的音效限制。
 * 2. 指標恢復：在第一次點擊後，自動從 LocalStorage 恢復上次導航到的頁面。
 * 3. CRT 開關機動畫：實作 `crt-switch-on` 與 `crt-switch-off` 的視覺效果。
 * 4. 休眠邏輯：當頁面失去焦點 (Blur) 長時間後，自動進入螢幕保護狀態。
 * 5. 螢幕保護事件：發射 screensaver:activated / deactivated 供 MOD 掛載。
 * 依賴：navi.js, crt-vfx.css
 * =================================================================
 */

import { setActiveNaviItem, updateNaviPosition } from "./navi.js";
import * as Settings from './settings.js';

const overlay = document.getElementById("press-start-overlay");

// --- 狀態變數 ---
let justGainedFocus = false;
let focusTimer;
let firstTriggered = false;
// When set, the NEXT click that dismisses the overlay triggers a full
// page reload instead of the normal "restore last nav + navigate" flow.
// Used when a cross-tab session change invalidates this tab's in-memory
// state (BB branches, WT connections, MOD instances, etc.) — a clean
// reload is safer than patching half the modules.
let forceReloadOnDismiss = false;

/**
 * Force the Press Start overlay back to screen. The next click on the
 * overlay will perform a full page reload. If the overlay is already
 * visible (e.g. screensaver already fired), we just promote its dismiss
 * action to a reload.
 */
export function showForReload() {
    forceReloadOnDismiss = true;
    if (overlay.style.display !== "flex") {
        overlay.classList.add("crt-switch-on");
        overlay.style.display = "flex";
        window.dispatchEvent(new CustomEvent('screensaver:activated', {
            detail: { initial: false }
        }));
    }
}

/**
 * 查詢螢幕保護是否啟動中
 */
export function isScreensaverActive() {
    return overlay.style.display !== 'none';
}

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
    if (overlay.style.display === "none" || justGainedFocus) return;
    overlay.dataset.handled = '1';

    // Session changed in another tab → reload instead of the standard
    // restore-last-nav flow. Set a sessionStorage flag so the next
    // page load skips the Press Start overlay entirely (no point making
    // the user tap twice). sessionStorage is tab-scoped, so the flag
    // lives through this tab's reload but never leaks to other tabs.
    if (forceReloadOnDismiss) {
        sessionStorage.setItem('skipPressStart', '1');
        window.location.reload();
        return;
    }

    window.dispatchEvent(new CustomEvent('screensaver:deactivated'));

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

    // 當離開頁面時間超過設定值時，恢復 Press Start 螢幕（310 = OFF）
    const rawTimeout = parseInt(Settings.getGlobal('screensaverTimeout')) || 60;
    if (rawTimeout >= 310) return;
    const timeout = rawTimeout * 1000;
    focusTimer = setTimeout(() => {
        overlay.classList.add("crt-switch-on");
        overlay.style.display = "flex";
        window.dispatchEvent(new CustomEvent('screensaver:activated', {
            detail: { initial: false }
        }));
    }, timeout);
});

// 初始頁面載入：overlay 一開始是可見的（開機畫面）
// Exception: if the previous session hit showForReload(), it stashed a
// 'skipPressStart' flag in sessionStorage before reloading. Honour it
// by silently dismissing the overlay and restoring navigation straight
// away — the user already "pressed start" in the logical sense by
// clicking the forced overlay, and a second click on reload is just
// noise.
if (sessionStorage.getItem('skipPressStart') === '1') {
    sessionStorage.removeItem('skipPressStart');
    overlay.style.display = "none";
    overlay.dataset.handled = '1';
    firstTriggered = true;

    const restoreNav = () => {
        if (!localStorage.getItem("navi-item-head")) {
            localStorage.setItem("navi-item-head", "blackboard");
        }
        const lastNaviItem = localStorage.getItem("navi-item-head");
        const $targetItem = document.querySelector(`.navi-item[data-navi-item="${lastNaviItem}"]`);
        if ($targetItem) {
            setActiveNaviItem($targetItem);
            updateNaviPosition(lastNaviItem);
        }
        window.dispatchEvent(new CustomEvent('screensaver:deactivated'));
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', restoreNav, { once: true });
    } else {
        restoreNav();
    }
} else {
    window.dispatchEvent(new CustomEvent('screensaver:activated', {
        detail: { initial: true }
    }));
}