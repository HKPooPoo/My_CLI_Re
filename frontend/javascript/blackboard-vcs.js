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
            return true;
        }

        // 2. 如果在 Head 0，且內容不是空的，則新增一頁
        if (currentText.trim()) {
            await BBCore.addRecord(state.owner, state.branchId, state.branch);
            await BBCore.cleanupOldRecords(state.owner, state.branchId, state.maxSlot);
            state.currentHead = 0;
            return true;
        }

        return false;
    },

    /**
     * 執行拉回 (向後翻閱歷史)
     */
    async pull(state, currentText) {
        const count = await BBCore.countRecords(state.owner, state.branchId);

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
        const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        if (entry && entry.text !== text) {
            // 使用 [owner, branchId, timestamp] 複合主鍵進行更新
            await BBCore.updateText(state.owner, state.branchId, entry.timestamp, text);
        }
    },

    /**
     * Commit: 將目前 local 分支上傳至 Server (以 uid 名義)
     */
    async commit(state, currentText) {
        // 1. 先確保目前內容已儲存至 local
        await this.save(state, currentText);

        const loggedInUser = localStorage.getItem("currentUser");
        if (!loggedInUser) throw new Error("請先登入以進行 Commit");

        // 2. 抓取目前 local 分支的所有紀錄
        const records = await BBCore.getAllRecordsForBranch("local", state.branchId);

        // 3. 上傳至伺服器
        const res = await fetch('/api/blackboard/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // 傳送登入憑證
            body: JSON.stringify({
                branchId: state.branchId,
                branchName: state.branch,
                records: records
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || "上傳失敗");
        }

        return true;
    }
};
