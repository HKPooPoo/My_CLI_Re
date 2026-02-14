import { BBCore } from "./blackboard-core.js";

/**
 * Blackboard 版本控制邏輯層 (大腦)
 */
export const BBVCS = {
    /**
     * 執行推播 (向上翻頁或回到前端)
     */
    async push(state, currentText) {
        // 先儲存當前內容
        await this.save(state, currentText);

        // 1. 如果在歷史頁面，則往回跳一頁 (回到較新紀錄)
        if (state.currentHead > 0) {
            state.currentHead--;
            return true; // 返回 true 代表需要更新 UI
        }

        // 2. 如果在 Head 0，且內容不是空的，則新增一頁
        if (currentText.trim()) {
            await BBCore.addEmptyRecord(state.owner, state.branch);
            await BBCore.cleanupOldRecords(state.owner, state.branch, state.maxSlot);
            state.currentHead = 0; // 保持在最新的一頁
            return true;
        }

        return false;
    },

    /**
     * 執行拉回 (向後翻閱歷史)
     */
    async pull(state, currentText) {
        const count = await BBCore.countRecords(state.owner, state.branch);

        if (state.currentHead < count - 1) {
            await this.save(state, currentText);
            state.currentHead++;
            return true;
        }

        return false;
    },

    /**
     * 自動儲存
     */
    async save(state, text) {
        const entry = await BBCore.getRecord(state.owner, state.branch, state.currentHead);
        if (entry && entry.text !== text) {
            await BBCore.updateText(entry.id, text);
        }
    }
};
