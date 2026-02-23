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
import { AuthService } from "./services/auth-service.js";
import { t } from './i18n.js';

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
            const uidDisplay = userData.title ? `${userData.uid} [${userData.title}]` : userData.uid;
            this.elements.userInfoUid.textContent = t('auth.welcome', { uid: uidDisplay });
            localStorage.setItem("currentUser", userData.uid);
            if (userData.title) {
                localStorage.setItem("currentTitle", userData.title);
            } else {
                localStorage.removeItem("currentTitle");
            }

            // 設定 Email Placeholder
            if (this.elements.emailInput) {
                this.elements.emailInput.placeholder = userData.email ? `${t('auth.emailPlaceholder')}: ${userData.email}` : t('auth.emailPlaceholder');
            }
        } else {
            this.elements.loginContainer.style.display = "flex";
            this.elements.logoutContainer.style.display = "none";
            this.elements.userInfoUid.textContent = "";
            localStorage.removeItem("currentUser");
            localStorage.removeItem("currentTitle");
        }

        window.dispatchEvent(new CustomEvent("auth:updated"));
    },

    /**
     * 初始化啟動
     */
    async init() {
        this.bindEvents();
        this.bindPWAEvents();

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
                        BBMessage.error(t('auth.inputRequired'));
                        return;
                    }

                    const msg = BBMessage.info(t('auth.authenticating'));
                    try {
                        const data = await AuthService.login({ uid, passcode });
                        msg.update(t('auth.welcome', { uid: data.user.uid.toUpperCase() }));
                        // 登入成功後重新初始化以獲取完整資訊
                        this.init();
                        this.elements.uidInput.value = "";
                        this.elements.passcodeInput.value = "";
                    } catch (e) {
                        console.error("LOGIN ERROR:", e);
                        msg.close();
                        BBMessage.error(e.message || t('auth.authFailed'));
                    }
                }
            });
        }

        // --- 註冊邏輯 ---
        if (this.elements.registerBtn) {
            new MultiStepButton(this.elements.registerBtn, [
                { label: t('auth.registerStep1'), sound: "Click.mp3" },
                { label: t('auth.registerStep2'), sound: "Click.mp3" },
                { label: t('auth.registerStep3'), sound: "Click.mp3" },
                {
                    label: t('auth.registerStep4'),
                    sound: "Cassette.mp3",
                    action: async () => {
                        const uid = this.elements.uidInput.value.trim();
                        const passcode = this.elements.passcodeInput.value.trim();

                        if (!uid || !passcode) {
                            BBMessage.error(t('auth.inputRequired'));
                            return;
                        }

                        const msg = BBMessage.info(t('auth.registering'));
                        try {
                            const data = await AuthService.register({ uid, passcode });
                            msg.update(t('auth.registerComplete'));
                        } catch (e) {
                            console.error("REGISTER ERROR:", e);
                            msg.close();
                            BBMessage.error(e.message || t('auth.registerFailed'));
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
                        BBMessage.info(t('auth.logoutComplete'));
                    } catch (e) {
                        console.error("LOGOUT ERROR:", e);
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
                        const msg = BBMessage.info(t('auth.executing'));
                        try {
                            const data = await AuthService.executeCommand({ command: input });
                            msg.update(data.message);
                            this.elements.passcodeInput.value = "";
                        } catch (e) {
                            console.error("CMD ERROR:", e);
                            msg.close();
                            if (e.status === 429) {
                                BBMessage.error(t('auth.tooManyAttempts'));
                            } else {
                                BBMessage.error(e.message || t('auth.offlineError'));
                            }
                        }
                    } else {
                        if (!uid) {
                            return BBMessage.error(t('auth.uidRequired'));
                        }
                        const msg = BBMessage.info(t('auth.requesting'));
                        try {
                            const data = await AuthService.requestPasswordReset({ uid });
                            msg.update(data.message);
                        } catch (e) {
                            console.error("RESET ERROR:", e);
                            msg.close();
                            if (e.status === 429) {
                                BBMessage.error(t('auth.tooManyAttempts'));
                            } else if (e.message === "UID NOT FOUND OR EMAIL NOT BOUND.") {
                                BBMessage.error(t('auth.noEmail'));
                            } else {
                                BBMessage.error(e.message || t('auth.offlineError'));
                            }
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
                    return BBMessage.error(t('auth.emailRequired'));
                }

                try {
                    const isCommand = input.startsWith("/bind");

                    if (!isCommand) {
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRegex.test(input)) {
                            this.isBinding = false;
                            return BBMessage.error(t('auth.invalidEmail'));
                        }
                    }

                    const msg = BBMessage.info(t('auth.processing'));

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
                        console.error("BIND ERROR:", e);
                        msg.close();
                        if (e.status === 429) {
                            BBMessage.error(t('auth.tooManyAttempts'));
                        } else if (e.status === 422) {
                            BBMessage.error(t('auth.invalidEmail'));
                        } else {
                            BBMessage.error(e.message || t('auth.offlineError'));
                        }
                    }
                } finally {
                    this.isBinding = false;
                }
            });
        }
    },

    /**
     * PWA 事件綁定
     */
    bindPWAEvents() {
        if (this.pwaEventsBound) return;
        this.pwaEventsBound = true;

        window.addEventListener("pwa:installable", () => {
            console.log("PWA: Install event received, rendering buttons...");
            this.renderInstallButton(this.elements.loginContainer);
            this.renderInstallButton(this.elements.logoutContainer);
        });
    },

    renderInstallButton(container) {
        if (!container || container.querySelector(".btn-pwa-install")) return;

        const btn = document.createElement("button");
        btn.className = "auth-btn crt-text-green btn-pwa-install";
        btn.textContent = t('auth.installBtn');
        btn.style.marginTop = "1rem";
        btn.style.border = "1px dashed var(--crt-green)";

        btn.addEventListener("click", async () => {
            if (window.installPWA) {
                await window.installPWA();
                btn.remove(); // 安裝後移除按鈕
            }
        });

        container.appendChild(btn);
    }
};

// --- 自動啟動 ---
AuthManager.init();
