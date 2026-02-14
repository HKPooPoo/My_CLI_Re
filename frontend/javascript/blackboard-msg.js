import { ToastMessager } from "./toast.js";

const toast = new ToastMessager();

/**
 * Blackboard 系統統一訊息管理
 */
export const BBMessage = {
    /**
     * 系統資訊提示
     * @param {string} text 訊息內容
     */
    info(text) {
        toast.addMessage(`System: ${text}`);
    },

    /**
     * 錯誤提示
     * @param {string} text 錯誤內容
     */
    error(text) {
        toast.addMessage(`Error: ${text}`);
    },

    /**
     * 工作成功提示
     * @param {string} action 執行動作名稱
     */
    success(action) {
        toast.addMessage(`System: ${action} 成功。`);
    },

    /**
     * 需要登入提示
     */
    requireLogin() {
        toast.addMessage("System: 請先登入以使用此功能。");
    }
};
