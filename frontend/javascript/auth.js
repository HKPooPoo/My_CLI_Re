/**
 * Auth Manager - Account & Synchronization Control
 * =================================================================
 * 介紹：負責處理使用者身份驗證 (登入/註冊/登出) 與後端 API 通訊。
 * 職責：
 * 1. 管理帳戶相關的 DOM 元素與顯示狀態切換。
 * 2. 實作登入/註冊資料提交與憑證處理。
 * 3. 支援 CLI 格式的密碼重設與郵件綁定邏輯。
 * 4. 維護本地 `localStorage` 的登入紀錄，並在狀態改變時廣播全域事件。
 * 依賴：blackboard-msg.js, multiStepButton.js, toast.js
 * =================================================================
 */

import { BBMessage } from "./blackboard-msg.js";
import { MultiStepButton } from "./multiStepButton.js";
import toast from "./toast.js";

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
        logoutContainer: document.querySelector(".auth-logout-container"),
        resetPasscodeBtn: document.getElementById("btn-reset-passcode"),
        emailInput: document.getElementById("auth-register-email"),
        emailBindBtn: document.getElementById("btn-register-email")
    },

    /**
     * 更新 UI 顯示狀態
     */
    updateUI(userData) {
        if (userData && userData.uid) {
            this.elements.loginContainer.style.display = "none";
            this.elements.logoutContainer.style.display = "flex";
            this.elements.userInfoUid.textContent = userData.uid;
            localStorage.setItem("currentUser", userData.uid);

            // 設定 Email Placeholder
            if (this.elements.emailInput) {
                this.elements.emailInput.placeholder = "EMAIL: " + userData.email || "EMAIL";
            }
        } else {
            this.elements.loginContainer.style.display = "flex";
            this.elements.logoutContainer.style.display = "none";
            this.elements.userInfoUid.textContent = "";
            localStorage.setItem("currentUser", "");
        }

        window.dispatchEvent(new CustomEvent("blackboard:authUpdated"));
    },

    /**
     * 初始化啟動
     */
    async init() {
        this.bindEvents();

        // 恢復上次登入狀態 (從後端獲取完整資料)
        try {
            const res = await fetch('/api/auth-status', {
                headers: { 'Accept': 'application/json' }
            });
            const data = await res.json();
            this.updateUI(data.isLoggedIn ? data : null);
        } catch (e) {
            const currentUser = localStorage.getItem("currentUser");
            this.updateUI(currentUser && currentUser !== "local" ? { uid: currentUser } : null);
        }
    },

    /**
     * 事件綁定區
     */
    bindEvents() {
        // --- 登入邏輯 ---
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
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            credentials: 'include',
                            body: JSON.stringify({ uid, passcode })
                        });
                        const data = await res.json();

                        if (res.ok) {
                            msg.update(`WELCOME BACK, ${data.user.uid.toUpperCase()}`);
                            // 登入成功後重新初始化以獲取完整資訊
                            this.init();
                            this.elements.uidInput.value = "";
                            this.elements.passcodeInput.value = "";
                        } else {
                            msg.close();
                            BBMessage.error(data.message || "AUTH FAILED.");
                        }
                    } catch (e) {
                        msg.close();
                        BBMessage.error("OFFLINE.");
                    }
                }
            });
        }

        // --- 註冊邏輯 ---
        if (this.elements.registerBtn) {
            new MultiStepButton(this.elements.registerBtn, [
                { label: "REGISTER", sound: "Click.mp3" },
                { label: "REGISTER x 3", sound: "Click.mp3" },
                { label: "REGISTER x 2", sound: "Click.mp3" },
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
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json'
                                },
                                body: JSON.stringify({ uid, passcode })
                            });
                            const data = await res.json();

                            if (res.ok) {
                                msg.update("REG COMPLETE.");
                            } else {
                                msg.close();
                                BBMessage.error(data.message || "FAILED.");
                            }
                        } catch (e) {
                            msg.close();
                            BBMessage.error("OFFLINE.");
                        }
                    }
                }
            ], 4000);
        }

        // --- 登出邏輯 ---
        if (this.elements.logoutBtn) {
            new MultiStepButton(this.elements.logoutBtn, {
                sound: "UISelectOff.mp3",
                action: async () => {
                    try {
                        await fetch('/api/logout', { method: 'POST', headers: { 'Accept': 'application/json' } });
                        this.updateUI(null);
                        BBMessage.info("LOGOUT.");
                    } catch (e) {
                        this.updateUI(null);
                    }
                }
            });
        }

        // --- 重置密碼邏輯 (方案 B: CLI 指令解析) ---
        if (this.elements.resetPasscodeBtn) {
            this.elements.resetPasscodeBtn.addEventListener("click", async () => {
                const uid = this.elements.uidInput.value.trim();
                const input = this.elements.passcodeInput.value.trim();

                const isCommand = input.startsWith("/passwd");

                if (isCommand) {
                    const msg = toast.addMessage("EXECUTING COMMAND...");
                    try {
                        const res = await fetch('/api/auth/command', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify({ command: input })
                        });
                        const data = await res.json();
                        msg.update(data.message);
                        if (res.ok) this.elements.passcodeInput.value = "";
                    } catch (e) {
                        msg.update("OFFLINE.");
                    }
                } else {
                    if (!uid) return toast.addMessage("UID REQUIRED FOR RESTORE.");
                    const msg = toast.addMessage("REQUESTING RESTORE...");
                    try {
                        const res = await fetch('/api/auth/request-reset', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify({ uid })
                        });
                        const data = await res.json();
                        msg.update(data.message);
                    } catch (e) {
                        msg.update("OFFLINE.");
                    }
                }
            });
        }

        // --- 郵件綁定邏輯 (方案 B: CLI 指令解析) ---
        if (this.elements.emailBindBtn) {
            this.elements.emailBindBtn.addEventListener("click", async () => {
                const input = this.elements.emailInput.value.trim();
                if (!input) return toast.addMessage("INPUT EMAIL OR COMMAND.");

                const isCommand = input.startsWith("/bind");
                const endpoint = isCommand ? '/api/auth/command' : '/api/auth/request-bind';
                const body = isCommand ? { command: input } : { email: input };

                const msg = toast.addMessage("PROCESSING...");
                try {
                    const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify(body)
                    });
                    const data = await res.json();
                    msg.update(data.message);
                    if (res.ok && isCommand) {
                        this.elements.emailInput.value = "";
                        // 綁定成功後刷新 UI 以更新 placeholder
                        this.init();
                    }
                } catch (e) {
                    msg.update("OFFLINE.");
                }
            });
        }
    }
};

// --- 自動啟動 ---
AuthManager.init();
