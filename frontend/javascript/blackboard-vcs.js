import { BBCore } from "./blackboard-core.js";
import { BBMessage } from "./blackboard-msg.js";
import db from "./indexedDB.js";

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
    },

    /**
     * Checkout: 切換分支，若本地不存在則從雲端抓取
     */
    async checkout(state, targetBranchId, targetOwner) {
        // 1. 檢查本地 IndexedDB 是否已有該分支資料 (owner: local)
        const localRecords = await BBCore.getAllRecordsForBranch("local", targetBranchId);

        if (localRecords.length === 0 && targetOwner !== "local") {
            // 2. 本地無資料但有線上標記 -> 從伺服器下載
            BBMessage.info("正在從雲端同步分支資料...");
            const res = await fetch(`/api/blackboard/branches/${targetBranchId}`, {
                credentials: 'include'
            });

            if (!res.ok) throw new Error("無法從雲端獲取分支內容");

            const data = await res.json();

            // 3. 轉換格式並存入本地 local 分區 (確保 BigInt 欄位在前端復原為 Number)
            const downloadRecords = data.records.map(r => ({
                owner: "local",
                branchId: parseInt(r.branch_id),
                branch: r.branch_name,
                timestamp: parseInt(r.timestamp),
                text: r.text,
                bin: r.bin,
                createdAt: r.created_at_hkt
            }));

            // 使用 bulkPut 以防本地已存在部分紀錄時崩潰
            await db.blackboard.bulkPut(downloadRecords);
        }

        // 4. 更新 state (編輯區永遠是 local)
        state.branchId = targetBranchId;
        state.owner = "local";
        state.currentHead = 0;

        // 嘗試更新 branchName (從 local 抓取最新一筆)
        const latest = await BBCore.getRecord("local", targetBranchId, 0);
        state.branch = latest?.branch ?? "";

        localStorage.setItem("currentBranchId", state.branchId);
        return true;
    }
};
