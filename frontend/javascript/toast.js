/**
 * Toast Messager - Simple Notification System
 * =================================================================
 * 介紹：負責系統底層的橫幅通知 (Toast) 顯示。
 * 職責：
 * 1. 管理通知 DOM 的動態插入與移除。
 * 2. 處理 CSS 動畫生命週期 (Showing -> Hiding -> DOM Remove)。
 * 3. 具備基礎防 XSS 機制 (使用 TextContent)。
 * 4. 支援「訊息更新」機制：返回 Handler 供非同步操作更新狀態。
 * 5. 支援類型化樣式 (info, error, success)。
 * 依賴：CSS 定義 (.toast, .showing, .hiding, .toast-error, .toast-success)
 * =================================================================
 */

export class ToastMessager {
    constructor() {
        this.container = document.getElementById('toast-container');
    }

    /**
     * 彈出一條新訊息
     * @param {string} text 訊息內容
     * @param {number} duration 顯示時長 (預設 5 秒)
     * @param {string} type 訊息類型 ('info'|'error'|'success')
     * @param {boolean} loading 是否為載入狀態 (標記 data-loading 供 MOD 識別)
     * @returns {Object} 訊息控制對象 { update, close }
     */
    addMessage(text, duration = 5000, type = 'info', loading = false) {
        if (!this.container) {
            console.warn('Toast container not found');
            return { update: () => { }, close: () => { } };
        }

        // --- 建立階段 ---
        const toast = document.createElement('div');
        toast.classList.add('toast');
        if (type) {
            toast.classList.add(`toast-${type}`);
        }
        if (loading) toast.dataset.loading = 'true';
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
             * @param {number} newDuration 新時長 (默認 5 秒)
             */
            update: (newText, newDuration = 5000) => {
                delete toast.dataset.loading;
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
     * 清除所有 Toast
     */
    clearAll() {
        if (!this.container) return;
        const toasts = this.container.querySelectorAll('.toast');
        toasts.forEach(toast => this.removeMessage(toast));
    }

    /**
     * 執行移除動畫 (或同步移除,若尚未顯示)
     *
     * Close-race contract: addMessage() defers adding the `.showing` class
     * to a requestAnimationFrame callback. A caller that closes the handle
     * synchronously (e.g. `msg.close()` in a catch block that ran before
     * the rAF fired — typical for fast-fail paths like non-login commit)
     * reaches removeMessage() while the toast is still in the DOM but
     * hasn't yet transitioned in. The old `!showing` guard short-circuited
     * those toasts and left them in the DOM forever. Now we split:
     *   - showing → fade out via `.hiding` + transitionend (+ timeout fallback)
     *   - not yet showing → remove from DOM synchronously, nothing to fade
     */
    removeMessage(toast) {
        if (!toast || !toast.parentElement) return;

        if (!toast.classList.contains('showing')) {
            toast.remove();
            return;
        }

        toast.classList.remove('showing');
        toast.classList.add('hiding');

        toast.addEventListener('transitionend', () => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, { once: true });

        // Safety fallback: remove from DOM if transitionend never fires
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 500);
    }
}

const toastMessager = new ToastMessager();
export default toastMessager;
