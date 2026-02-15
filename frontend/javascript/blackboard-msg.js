/**
 * Blackboard Message Wrapper
 * =================================================================
 * 介紹：黑板系統的統一訊息門面 (Facade)。
 * 職責：
 * 1. 封裝 `ToastMessager` 的調用細節。
 * 2. 標準化系統所有反饋文字的格式 (如前綴 "System: " 或 "Error: ")。
 * 3. 提供語意化的通知介面 (info, error, success)。
 * 依賴：toast.js
 * =================================================================
 */

import { ToastMessager } from "./toast.js";

// 建立全局唯一 Toast 實體
const toast = new ToastMessager();

export const BBMessage = {
    /**
     * 系統一般資訊提示
     */
    info(text) {
        toast.addMessage(`System: ${text}`);
    },

    /**
     * 嚴重錯誤提示
     */
    error(text) {
        toast.addMessage(`Error: ${text}`);
    },

    /**
     * 特定操作成功提示
     */
    success(action) {
        toast.addMessage(`System: ${action} 成功。`);
    },

    /**
     * 快捷提示：登入保護
     */
    requireLogin() {
        toast.addMessage("System: 請先登入以使用此功能。");
    }
};
