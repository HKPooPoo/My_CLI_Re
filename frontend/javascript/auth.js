import { BBMessage } from "./blackboard-msg.js";

/**
 * 帳戶系統前端控制
 */
export const AuthManager = {
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
     * @param {string|null} uid 使用者 ID，null 代表未登入
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
        // 通知 HUD 與其他組件狀態已改變
        window.dispatchEvent(new CustomEvent("blackboard:authUpdated"));
    },

    /**
     * 初始化並檢查登入狀態
     */
    async init() {
        this.bindEvents();

        // 初始可從 localStorage 讀取
        const currentUser = localStorage.getItem("currentUser");
        this.updateUI(currentUser && currentUser !== "local" ? currentUser : null);
    },

    bindEvents() {
        // 登入
        this.elements.loginBtn?.addEventListener("click", async () => {
            const uid = this.elements.uidInput.value.trim();
            const passcode = this.elements.passcodeInput.value.trim();

            if (!uid || !passcode) {
                BBMessage.error("請輸入 UID 與 Passcode");
                return;
            }

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include', // 關鍵：確保傳送 Session Cookie
                    body: JSON.stringify({ uid, passcode })
                });
                const data = await res.json();

                if (res.ok) {
                    BBMessage.info(`歡迎回來, ${data.user.uid}`);
                    this.updateUI(data.user.uid);
                    this.elements.uidInput.value = "";
                    this.elements.passcodeInput.value = "";
                } else {
                    BBMessage.error(data.message);
                }
            } catch (e) {
                BBMessage.error("伺服器連線失敗");
            }
        });

        // 註冊
        this.elements.registerBtn?.addEventListener("click", async () => {
            const uid = this.elements.uidInput.value.trim();
            const passcode = this.elements.passcodeInput.value.trim();

            if (!uid || !passcode) {
                BBMessage.error("請輸入 UID 與 Passcode");
                return;
            }

            try {
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid, passcode })
                });
                const data = await res.json();

                if (res.ok) {
                    BBMessage.info("註冊成功，請開始登入");
                } else {
                    BBMessage.error(data.message);
                }
            } catch (e) {
                BBMessage.error("伺服器連線失敗");
            }
        });

        // 登出
        this.elements.logoutBtn?.addEventListener("click", async () => {
            try {
                await fetch('/api/logout', { method: 'POST' });
                this.updateUI(null);
                BBMessage.info("已登出");
            } catch (e) {
                this.updateUI(null);
            }
        });
    }
};

// 立即執行
AuthManager.init();
