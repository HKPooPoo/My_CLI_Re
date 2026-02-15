/**
 * Toast Messager - Simple Notification System
 * =================================================================
 * 介紹：負責系統底層的橫幅通知 (Toast) 顯示。
 * 職責：
 * 1. 管理通知 DOM 的動態插入與移除。
 * 2. 處理 CSS 動畫生命週期 (Showing -> Hiding -> DOM Remove)。
 * 3. 具備基礎防 XSS 機制 (使用 TextContent)。
 * 依賴：CSS 定義 (.toast, .showing, .hiding)
 * =================================================================
 */

export class ToastMessager {
    constructor() {
        this.container = document.getElementById('toast-container');
    }

    /**
     * 彈出一條新訊息
     * @param {string} text 訊息內容
     * @param {number} duration 顯示時長 (預設 3 秒)
     */
    addMessage(text, duration = 3000) {
        if (!this.container) {
            console.warn('Toast container not found');
            return;
        }

        // --- 建立階段 ---
        const toast = document.createElement('div');
        toast.classList.add('toast');
        toast.textContent = text;

        this.container.appendChild(toast);

        // --- 動畫啟動階段 ---
        // 強制重繪 (Reflow) 確保過渡動畫生效
        void toast.offsetWidth;

        requestAnimationFrame(() => {
            toast.classList.add('showing');
        });

        // --- 銷毀排程 ---
        setTimeout(() => {
            this.removeMessage(toast);
        }, duration);
    }

    /**
     * 執行移除動畫
     */
    removeMessage(toast) {
        toast.classList.remove('showing');
        toast.classList.add('hiding');

        // 監聽 transitionend 確保動畫播完後才徹底抹除 DOM，避免視覺閃爍
        toast.addEventListener('transitionend', () => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, { once: true });
    }
}

// 預設實例化 (供外部 import 直接使用)
const toastMessager = new ToastMessager();
export default toastMessager;
