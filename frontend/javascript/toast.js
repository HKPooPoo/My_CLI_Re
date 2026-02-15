/**
 * Toast Messager - Simple Notification System
 * =================================================================
 * 介紹：負責系統底層的橫幅通知 (Toast) 顯示。
 * 職責：
 * 1. 管理通知 DOM 的動態插入與移除。
 * 2. 處理 CSS 動畫生命週期 (Showing -> Hiding -> DOM Remove)。
 * 3. 具備基礎防 XSS 機制 (使用 TextContent)。
 * 4. 支援「訊息更新」機制：返回 Handler 供非同步操作更新狀態。
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
     * @param {number} duration 顯示時長 (預設 30 秒)
     * @returns {Object} 訊息控制對象 { update, close }
     */
    addMessage(text, duration = 30000) {
        if (!this.container) {
            console.warn('Toast container not found');
            return { update: () => { }, close: () => { } };
        }

        // --- 建立階段 ---
        const toast = document.createElement('div');
        toast.classList.add('toast');
        toast.textContent = text;

        this.container.appendChild(toast);

        // --- 動畫啟動階段 ---
        void toast.offsetWidth; // 強制重繪 (Reflow)
        requestAnimationFrame(() => {
            toast.classList.add('showing');
        });

        // --- 銷毀邏輯 ---
        let removeTimer = null;
        const scheduleRemove = (ms) => {
            if (removeTimer) clearTimeout(removeTimer);
            if (ms > 0) {
                removeTimer = setTimeout(() => this.removeMessage(toast), ms);
            }
        };

        // 初始排程
        scheduleRemove(duration);

        // 返回控制 Handler
        return {
            /**
             * 更新訊息內容並重設計時器
             * @param {string} newText 新文字
             * @param {number} newDuration 新時長 (默認 30 秒)
             */
            update: (newText, newDuration = 30000) => {
                toast.textContent = newText;
                scheduleRemove(newDuration);
            },
            /**
             * 立即關閉訊息
             */
            close: () => {
                if (removeTimer) clearTimeout(removeTimer);
                this.removeMessage(toast);
            }
        };
    }

    /**
     * 執行移除動畫
     */
    removeMessage(toast) {
        if (!toast || !toast.classList.contains('showing')) return;

        toast.classList.remove('showing');
        toast.classList.add('hiding');

        toast.addEventListener('transitionend', () => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, { once: true });
    }
}

const toastMessager = new ToastMessager();
export default toastMessager;
