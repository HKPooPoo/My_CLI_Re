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

// [Optimization]: 延遲首次檢測，避免頁面加載時的 NetworkError
let heartbeatIntervalId = null;

function startHeartbeat() {
    if (heartbeatIntervalId) return;
    updateDatabaseStatus();
    heartbeatIntervalId = setInterval(updateDatabaseStatus, 15000);
}

function stopHeartbeat() {
    if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
    }
}

setTimeout(startHeartbeat, 3000);

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopHeartbeat();
    } else {
        startHeartbeat();
    }
});