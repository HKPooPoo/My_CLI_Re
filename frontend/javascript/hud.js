/**
 * HUD Controller (Heads-Up Display)
 * =================================================================
 * 介紹：負責管理頁面上實時狀態指示器 (HUD)，如伺服器連線狀態與登入用戶名。
 * 職責：
 * 1. 實時監測伺服器連線 (Heartbeat)：定時對 API 進行 Ping 操作並同步更新亮燈狀態。
 * 2. 登入狀態同步：監聽 auth.js 的事件快照，實時更新顯示的 UID。
 * 依賴：crt-vfx.css
 * 注意：主題切換邏輯已遷移至 theme-engine.js (MOD 框架)
 * =================================================================
 */

import { StatusService } from "./services/status-service.js";
import { t } from './i18n.js';
import { T } from './timing.js';

// --- 常量定義 ---
const ONLINE_STR = "ONLINE";
const OFFLINE_STR = "OFFLINE";

// --- DOM 引用 ---
const dbStatusDisplay = document.getElementById("db-status-display");
const loginStatusDisplay = document.getElementById("login-status-display");

/**
 * 更新目前顯示的登入 UID
 */
export function updateLoginStatus() {
    const currentUser = localStorage.getItem("currentUser") || "";
    const currentTitle = localStorage.getItem("currentTitle") || "";

    if (loginStatusDisplay) {
        loginStatusDisplay.textContent = currentTitle ? `${currentUser} [${currentTitle}]` : currentUser;
    }
}

// 監聽來自 auth.js 的全域事件，確保跨組件狀態同步
window.addEventListener("auth:updated", updateLoginStatus);

/**
 * 心跳檢測：更新資料庫與伺服器連線狀態
 * 步驟：1. 抓取 API 狀態 2. 判定與上次狀態是否有異 (避免重複渲染) 3. 切換 CSS 燈號類別
 */
async function updateDatabaseStatus() {
    try {
        const responseJSON = await StatusService.checkStatus();

        if (responseJSON.status === ONLINE_STR) {
            if (isStatusHasNoChange(ONLINE_STR)) return;
            replaceCrtTextColorBy("crt-text-green");
            dbStatusDisplay.textContent = t('hud.online');
        } else if (responseJSON.status === OFFLINE_STR) {
            if (isStatusHasNoChange(OFFLINE_STR)) return;
            replaceCrtTextColorBy("crt-text-red");
            dbStatusDisplay.textContent = t('hud.offline');
        }
    } catch (error) {
        console.error("DB Status Check Failed:", error);
        replaceCrtTextColorBy("crt-text-red");
        dbStatusDisplay.textContent = t('hud.error');
    }
}

/**
 * 輔助：更新狀態燈顏色
 * @param {string} crtTextColor 來自 crt-vfx.css 的原子類別
 */
function replaceCrtTextColorBy(crtTextColor) {
    dbStatusDisplay.classList.remove("crt-text-green", "crt-text-orange", "crt-text-red");
    dbStatusDisplay.classList.add(crtTextColor);
}

// 狀態變更快取，防止重複執行 DOM 操作
let previousStatus = "CONNECTING...";
function isStatusHasNoChange(nextStatus) {
    if (nextStatus === previousStatus) return true;
    previousStatus = nextStatus;
    return false;
}

// --- 初始化啟動 ---
updateLoginStatus();

replaceCrtTextColorBy("crt-text-orange"); // 最初顯示為 orange (CONNECTING...)

let heartbeatIntervalId = null;
let _heartbeatBusy = false;

async function guardedHeartbeat() {
    if (_heartbeatBusy) return;
    _heartbeatBusy = true;
    try { await updateDatabaseStatus(); } catch (_) {}
    _heartbeatBusy = false;
}

function startHeartbeat() {
    if (heartbeatIntervalId) return;
    guardedHeartbeat();
    heartbeatIntervalId = setInterval(guardedHeartbeat, T('frontend.background.hudHeartbeatInterval'));
}

function stopHeartbeat() {
    if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
    }
}

startHeartbeat();

// First heartbeat tick may run before i18n.initI18n() finishes fetching the
// locale JSON. i18n.js::t() falls back to returning the raw key when lookup
// misses, so `t('hud.online')` writes the literal string "hud.online" into
// the DOM. Once i18n is ready, reset previousStatus so the dedup guard
// (isStatusHasNoChange) doesn't early-exit, then re-run the status update —
// refetch is cheap and handles ONLINE / OFFLINE / error alike.
window.addEventListener('i18n:ready', () => {
    previousStatus = '';
    updateDatabaseStatus();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopHeartbeat();
    } else {
        startHeartbeat();
    }
});

// ========================================================================
// .branch-head inline edit — type a target head position and press Enter
// to swap the current record with the one at that index. Fires two
// custom events for consumer pages to listen to:
//   branchHead:reorderRequested — user pressed Enter with a valid number
//   branchHead:syncRequested    — user blurred without committing / had
//                                 an invalid value; consumer should
//                                 repaint the correct head value
// BB and BC each listen; each no-ops unless its own page is active.
// ========================================================================
const $branchHeadEl = document.querySelector('.branch-head');
const $branchNameEl = document.querySelector('.branch-name');

// QoL: focus .branch-head and highlight its current value so the user
// can type a replacement number immediately. Only wired to the
// .branch-name proxy — direct clicks on .branch-head keep the native
// caret-at-click behaviour so users can still insert / tweak a digit
// without overwriting the whole value.
function _focusAndSelectHeadIndex() {
    if (!$branchHeadEl) return;
    $branchHeadEl.focus();
    const range = document.createRange();
    range.selectNodeContents($branchHeadEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

if ($branchHeadEl) {
    $branchHeadEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); $branchHeadEl.blur(); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const raw = ($branchHeadEl.textContent || '').trim();
        $branchHeadEl.blur();
        const target = parseInt(raw, 10);
        if (isNaN(target)) {
            window.dispatchEvent(new CustomEvent('branchHead:syncRequested'));
            return;
        }
        window.dispatchEvent(new CustomEvent('branchHead:reorderRequested', { detail: { target } }));
    });
    $branchHeadEl.addEventListener('blur', () => {
        // Ensure the field reflects the true current state after any
        // uncommitted edit — the active page's listener will repaint.
        window.dispatchEvent(new CustomEvent('branchHead:syncRequested'));
    });
}

// Clicking anywhere on .branch-name redirects focus to the head index.
// The branch-name div is bigger and easier to hit; users who want to
// reorder tend to click the most prominent HUD element anyway.
if ($branchNameEl) {
    $branchNameEl.addEventListener('click', _focusAndSelectHeadIndex);
}