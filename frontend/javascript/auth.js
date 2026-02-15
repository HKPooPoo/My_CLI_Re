/**
 * Auth Manager - Account & Synchronization Control
 * =================================================================
 * 介紹：負責處理使用者身份驗證 (登入/註冊/登出) 與後端 API 通訊。
 * 職責：
 * 1. 管理帳戶相關的 DOM 元素與顯示狀態切換。
 * 2. 實作登入/註冊資料提交與憑證處理。
 * 3. 使用 `MultiStepButton` 為註冊按鈕提供防誤點的四階確認機制。
 * 4. 維護本地 `localStorage` 的登入紀錄，並在狀態改變時廣播全域事件。
 * 依賴：blackboard-msg.js, multiStepButton.js
 * =================================================================
 */

import { BBMessage } from "./blackboard-msg.js";
import { MultiStepButton } from "./multiStepButton.js";

export const AuthManager = {
    // --- DOM 引用 ---
    elements: {
        uidInput: document.getElementById("auth-uid"),
        passcodeInput: document.getElementById("auth-passcode"),
        loginBtn: document.getElementById("btn-login"),
        registerBtn: document.getElementById("btn-register"),
        logoutBtn: document.getElementById("btn-logout"),
        userInfoUid: document.getElementById("auth-user-info-uid"),
        loginContainer: document.querySelector(".auth-login-register-container"),
        logoutContainer: document.querySelector(".auth-logout-container")
    },

    /**
     * 更新 UI 顯示狀態
     * 步驟：1. 若有 UID 則隱藏登入區、顯示登出區 2. 同步 localStorage 3. 發送全域廣播
     */
    updateUI(uid) {
        if (uid) {
            this.elements.loginContainer.style.display = "none";
            this.elements.logoutContainer.style.display = "flex";
            this.elements.userInfoUid.textContent = uid;
            localStorage.setItem("currentUser", uid);
        } else {
            this.elements.loginContainer.style.display = "flex";
            this.elements.logoutContainer.style.display = "none";
            this.elements.userInfoUid.textContent = "";
            localStorage.setItem("currentUser", "");
        }

        // 通知 HUD、黑板等組件進行重繪 or API 刷新
        window.dispatchEvent(new CustomEvent("blackboard:authUpdated"));
    },

    /**
     * 初始化啟動
     */
    async init() {
        this.bindEvents();

        // 恢復上次登入狀態
        const currentUser = localStorage.getItem("currentUser");
        this.updateUI(currentUser && currentUser !== "local" ? currentUser : null);
    },

    /**
     * 事件綁定區
     */
    bindEvents() {
        // --- 登入邏輯 (單階 MultiStepButton) ---
        if (this.elements.loginBtn) {
            new MultiStepButton(this.elements.loginBtn, {
                sound: "UIPipboyOK.mp3",
                action: async () => {
                    const uid = this.elements.uidInput.value.trim();
                    const passcode = this.elements.passcodeInput.value.trim();

                    if (!uid || !passcode) {
                        BBMessage.error("INPUT UID/PASS.");
                        return;
                    }

                    const msg = BBMessage.info("AUTH...");
                    try {
                        const res = await fetch('/api/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ uid, passcode })
                        });
                        const data = await res.json();

                        if (res.ok) {
                            msg.update(`WELCOME BACK, ${data.user.uid.toUpperCase()}`);
                            this.updateUI(data.user.uid);
                            this.elements.uidInput.value = "";
                            this.elements.passcodeInput.value = "";
                        } else {
                            msg.close();
                            BBMessage.error("AUTH FAILED.");
                        }
                    } catch (e) {
                        msg.close();
                        BBMessage.error("OFLINE.");
                    }
                }
            });
        }

        // --- 註冊邏輯 (四階步進確認) ---
        if (this.elements.registerBtn) {
            new MultiStepButton(this.elements.registerBtn, [
                {
                    label: "REGISTER",
                    sound: "Click.mp3",
                    // action: () => BBMessage.info("CONFIRM (3)")
                },
                {
                    label: "REGISTER x 3",
                    sound: "Click.mp3",
                    // action: () => BBMessage.info("CONFIRM (2)")
                },
                {
                    label: "REGISTER x 2",
                    sound: "Click.mp3",
                    // action: () => BBMessage.info("CONFIRM (1)")
                },
                {
                    label: "CONFIRM!",
                    sound: "Cassette.mp3",
                    action: async () => {
                        const uid = this.elements.uidInput.value.trim();
                        const passcode = this.elements.passcodeInput.value.trim();

                        if (!uid || !passcode) {
                            BBMessage.error("INPUT UID/PASS.");
                            return;
                        }

                        const msg = BBMessage.info("SENDING...");
                        try {
                            const res = await fetch('/api/register', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ uid, passcode })
                            });
                            const data = await res.json();

                            if (res.ok) {
                                msg.update("REG COMPLETE.");
                            } else {
                                msg.close();
                                BBMessage.error("FAILED.");
                            }
                        } catch (e) {
                            msg.close();
                            BBMessage.error("OFFLINE.");
                        }
                    }
                }
            ], 4000);
        }

        // --- 登出邏輯 (單階 MultiStepButton) ---
        if (this.elements.logoutBtn) {
            new MultiStepButton(this.elements.logoutBtn, {
                sound: "UISelectOff.mp3",
                action: async () => {
                    try {
                        await fetch('/api/logout', { method: 'POST' });
                        this.updateUI(null);
                        BBMessage.info("LOGOUT.");
                    } catch (e) {
                        this.updateUI(null);
                    }
                }
            });
        }
    }
};

// --- 自動啟動 ---
AuthManager.init();
