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
import { BBCore } from "./blackboard-core.js";
import toast from "./toast.js";
import { AuthService } from "./services/auth-service.js";

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
                this.elements.emailInput.placeholder = "EMAIL: " + (userData.email || "EMAIL");
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
            const data = await AuthService.getStatus();
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
        if (this.eventsBound) return;
        this.eventsBound = true;

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
                        const data = await AuthService.login({ uid, passcode });
                        msg.update(`WELCOME BACK, ${data.user.uid.toUpperCase()}`);
                        // 登入成功後重新初始化以獲取完整資訊
                        this.init();
                        this.elements.uidInput.value = "";
                        this.elements.passcodeInput.value = "";
                    } catch (e) {
                        msg.close();
                        BBMessage.error(e.message || "AUTH FAILED.");
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
                            const data = await AuthService.register({ uid, passcode });
                            msg.update("REG COMPLETE.");
                        } catch (e) {
                            msg.close();
                            BBMessage.error(e.message || "FAILED.");
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
                        await AuthService.logout();
                        
                        // 抹除本地同步資料
                        await BBCore.wipeSyncedData();
                        
                        this.updateUI(null);
                        BBMessage.info("LOGOUT & SYNCED DATA ERASED.");
                        
                        // 通知 UI 刷新分支清單
                        window.dispatchEvent(new CustomEvent("blackboard:branchUpdated"));
                    } catch (e) {
                        this.updateUI(null);
                    }
                }
            });
        }

        // --- 重置密碼邏輯 (方案 B: CLI 指令解析) ---
        if (this.elements.resetPasscodeBtn) {
            this.elements.resetPasscodeBtn.addEventListener("click", async () => {
                if (this.isResetting) return;
                this.isResetting = true;

                const uid = this.elements.uidInput.value.trim();
                const input = this.elements.passcodeInput.value.trim();

                try {
                    const isCommand = input.startsWith("/passwd");

                    if (isCommand) {
                        const msg = toast.addMessage("EXECUTING COMMAND...");
                        try {
                            const data = await AuthService.executeCommand({ command: input });
                            msg.update(data.message);
                            this.elements.passcodeInput.value = "";
                        } catch (e) {
                            msg.update(e.message || "OFFLINE.");
                        }
                    } else {
                        if (!uid) {
                            return toast.addMessage("UID REQUIRED FOR RESTORE.");
                        }
                        const msg = toast.addMessage("REQUESTING RESTORE...");
                        try {
                            const data = await AuthService.requestPasswordReset({ uid });
                            msg.update(data.message);
                        } catch (e) {
                            msg.update(e.message || "OFFLINE.");
                        }
                    }
                } finally {
                    this.isResetting = false;
                }
            });
        }

        // --- 郵件綁定邏輯 (方案 B: CLI 指令解析) ---
        if (this.elements.emailBindBtn) {
            this.elements.emailBindBtn.addEventListener("click", async () => {
                if (this.isBinding) return;
                this.isBinding = true;

                const input = this.elements.emailInput.value.trim();
                if (!input) {
                    this.isBinding = false;
                    return toast.addMessage("INPUT EMAIL OR COMMAND.");
                }

                try {
                    const isCommand = input.startsWith("/bind");
                    const msg = toast.addMessage("PROCESSING...");

                    try {
                        let data;
                        if (isCommand) {
                            data = await AuthService.executeCommand({ command: input });
                        } else {
                            data = await AuthService.requestEmailBinding({ email: input });
                        }

                        msg.update(data.message);
                        if (isCommand) {
                            this.elements.emailInput.value = "";
                            // 綁定成功後刷新 UI 以更新 placeholder
                            this.init();
                        }
                    } catch (e) {
                        msg.update(e.message || "OFFLINE.");
                    }
                } finally {
                    this.isBinding = false;
                }
            });
        }
    }
};

// --- 自動啟動 ---
AuthManager.init();
