/**
 * HUD Controller (Heads-Up Display)
 * =================================================================
 * 介紹：負責管理頁面上實時狀態指示器 (HUD)，如伺服器連線狀態、登入用戶名與主題切換。
 * 職責：
 * 1. 實時監測伺服器連線 (Heartbeat)：定時對 API 進行 Ping 操作並同步更新亮燈狀態。
 * 2. 登入狀態同步：監聽 auth.js 的事件快照，實時更新顯示的 UID。
 * 3. 視覺風格 (Theme) 切換：管理 CRT/明亮模式 切換邏輯與持久化存儲。
 * 依賴：audio.js, crt-vfx.css
 * =================================================================
 */

import { playAudio } from "./audio.js";

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
    if (loginStatusDisplay) {
        loginStatusDisplay.textContent = currentUser;
    }
}

// 監聽來自 auth.js 的全域事件，確保跨組件狀態同步
window.addEventListener("blackboard:authUpdated", updateLoginStatus);

/**
 * 心跳檢測：更新資料庫與伺服器連線狀態
 * 步驟：1. 抓取 API 狀態 2. 判定與上次狀態是否有異 (避免重複渲染) 3. 切換 CSS 燈號類別
 */
async function updateDatabaseStatus() {
    try {
        const response = await fetch('/api/status');
        const responseJSON = await response.json();

        if (responseJSON.status === ONLINE_STR) {
            if (isStatusHasNoChange(ONLINE_STR)) return;
            replaceCrtTextColorBy("crt-text-green");
            dbStatusDisplay.textContent = ONLINE_STR;
        } else if (responseJSON.status === OFFLINE_STR) {
            if (isStatusHasNoChange(OFFLINE_STR)) return;
            replaceCrtTextColorBy("crt-text-red");
            dbStatusDisplay.textContent = OFFLINE_STR;
        }
    } catch (error) {
        console.error("DB Status Check Failed:", error);
        replaceCrtTextColorBy("crt-text-red");
        dbStatusDisplay.textContent = "ERROR";
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

// --- 主題切換邏輯 (Theme Manager) ---
let localStorageSavedTheme = localStorage.getItem("data-theme");
let crtMode = localStorageSavedTheme === "light" ? false : true;

// 頁面加載時恢復上次的主題
if (!crtMode) document.documentElement.setAttribute("data-theme", "light");

document.getElementById("theme-change-btn").addEventListener("click", () => {
    playAudio("UIPipboyOKPress.mp3");
    if (crtMode) {
        document.documentElement.setAttribute("data-theme", "light");
        crtMode = false;
        localStorage.setItem("data-theme", "light");
    } else {
        document.documentElement.removeAttribute("data-theme");
        crtMode = true;
        localStorage.setItem("data-theme", "");
    }
});

// --- 初始化啟動 ---
updateLoginStatus();
replaceCrtTextColorBy("crt-text-orange"); // 最初顯示為 orange (CONNECTING...)
updateDatabaseStatus();
setInterval(updateDatabaseStatus, 1000); // 每  秒檢索一次連線狀態