import { ToastMessager } from "./toast.js";
import db, { Dexie } from "./indexedDB.js";
import { initBoard } from "./blackboard.js";

const toast = new ToastMessager();

const $uidInput = document.getElementById("auth-uid");
const $passcodeInput = document.getElementById("auth-passcode");
const $loginBtn = document.getElementById("btn-login");
const $registerBtn = document.getElementById("btn-register");
const $logoutBtn = document.getElementById("btn-logout");
const $loginStatusDisplay = document.getElementById("login-status-display");
const $userInfoUid = document.getElementById("auth-user-info-uid");

const $loginRegisterContainer = document.querySelector(".auth-login-register-container");
const $logoutContainer = document.querySelector(".auth-logout-container");
const $authShowUidContainer = document.querySelector(".auth-show-uid-container");


/**
 * 執行登出與資料清理
 */
async function cleanupAndLogout() {
    const currentUser = localStorage.getItem("currentUser");
    if (currentUser && currentUser !== "guest") {
        // 刪除該使用者的本地快取記錄 (安全性考量)
        await db.blackboard.where('[owner+branch+timestamp]')
            .between(
                [currentUser, Dexie.minKey, Dexie.minKey],
                [currentUser, Dexie.maxKey, Dexie.maxKey]
            )
            .delete();
    }

    // 清除 Session 狀態
    localStorage.setItem("currentUser", "guest");
    localStorage.setItem("currentBranch", "master"); // 重置分支

    updateHUD("guest");
    toast.addMessage("System: 已登出。");

    // 不再重整頁面，直接重新初始化黑板
    await initBoard();
}

/**
 * 更新 HUD 與登入/登出區域的顯示狀態
 * @param {string} username 使用者名稱
 */
function updateHUD(username) {
    if ($loginStatusDisplay) {
        $loginStatusDisplay.textContent = username;
    }
    if ($userInfoUid) {
        $userInfoUid.textContent = username;
    }

    const isLoggedIn = username && username !== "guest";

    if (isLoggedIn) {
        if ($loginRegisterContainer) $loginRegisterContainer.style.display = "none";
        if ($logoutContainer) $logoutContainer.style.display = "flex";
        if ($authShowUidContainer) $authShowUidContainer.textContent = username;
    } else {
        if ($loginRegisterContainer) $loginRegisterContainer.style.display = "flex";
        if ($logoutContainer) $logoutContainer.style.display = "none";
        if ($authShowUidContainer) $authShowUidContainer.textContent = "";
    }
}

// 初始檢查
updateHUD(localStorage.getItem("currentUser") || "guest");

// 登入邏輯
if ($loginBtn) {
    $loginBtn.addEventListener("click", async () => {
        const uid = $uidInput.value.trim();
        const passcode = $passcodeInput.value.trim();

        if (!uid || !passcode) {
            toast.addMessage("System: 請輸入 UID 與 Passcode。");
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ uid, passcode })
            });

            const data = await response.json();

            if (response.ok) {
                // 登入成功
                localStorage.setItem("currentUser", data.user.uid);
                localStorage.setItem("currentBranch", "master"); // 預設切換至 master

                updateHUD(data.user.uid);
                toast.addMessage(`System: 歡迎回來，${data.user.uid}。`);

                $uidInput.value = "";
                $passcodeInput.value = "";


                // 不再重整頁面，直接重新初始化黑板
                await initBoard();
            } else {
                toast.addMessage(`Error: ${data.message || '登入失敗'}`);
            }
        } catch (error) {
            console.error(error);
            toast.addMessage("Error: 連線失敗。");
        }
    });
}

// 註冊邏輯
if ($registerBtn) {
    $registerBtn.addEventListener("click", async () => {
        const uid = $uidInput.value.trim();
        const passcode = $passcodeInput.value.trim();

        if (!uid || !passcode) {
            toast.addMessage("System: 請輸入 UID 與 Passcode。");
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ uid, passcode })
            });

            const data = await response.json();

            if (response.ok) {
                toast.addMessage("System: 註冊成功，請進行登入。");
            } else {
                toast.addMessage(`Error: ${data.message || '註冊失敗'}`);
            }
        } catch (error) {
            console.error(error);
            toast.addMessage("Error: 連線失敗。");
        }
    });
}

// 登出邏輯
if ($logoutBtn) {
    $logoutBtn.addEventListener("click", cleanupAndLogout);
}
