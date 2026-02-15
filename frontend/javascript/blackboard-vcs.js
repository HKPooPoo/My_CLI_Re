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

        // 數據清洗
        await BBCore.scrubBranch(state.owner, state.branchId, state.maxSlot);

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
        // 數據清洗
        await BBCore.scrubBranch(state.owner, state.branchId, state.maxSlot);

        const count = await BBCore.countRecords(state.owner, state.branchId);

        if (state.currentHead < count - 1) {
            await this.save(state, currentText);
            state.currentHead++;
            return true;
        }

        return false;
    },

    /**
     * 自動儲存：更新現有歷史點或新增初始點
     */
    async save(state, text) {
        const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        
        if (entry) {
            if (entry.text !== text) {
                // 如果我們修改的是歷史節點 (Head > 0)
                if (state.currentHead > 0) {
                    // 檢查當前的 Head 0 是否為空，是的話就刪掉它避免廢頁
                    const head0 = await BBCore.getRecord(state.owner, state.branchId, 0);
                    if (head0 && (!head0.text || head0.text.trim() === "")) {
                        await db.blackboard.delete([head0.owner, head0.branchId, head0.timestamp]);
                    }
                }

                // 更新現有紀錄 (這會改變 timestamp 並使該紀錄變為 Head 0)
                await BBCore.updateText(state.owner, state.branchId, entry.timestamp, text);
                
                // 無腦同步：不論原本在哪，編輯後該紀錄都變成了最新的 Head 0
                state.currentHead = 0;
            }
        } else if (state.currentHead === 0) {
            // 如果本地完全沒紀錄且在 Head 0，則視為初始點，直接新增
            await BBCore.addRecord("local", state.branchId, state.branch, text);
        }
    },

    /**
     * Commit: 將指定分支的所有本地歷史上傳至 Server
     */
    async commit(branchMeta) {
        const { branchId, branch } = branchMeta;

        const loggedInUser = localStorage.getItem("currentUser");
        if (!loggedInUser) throw new Error("LOGIN REQUIRED FOR COMMIT.");

        // 0. Commit 前執行數據清洗 (移除空值與溢出)
        // 嘗試從環境中取得 maxSlot，若無則預設 10
        const maxSlot = parseInt(localStorage.getItem("blackboard_max_slot")) || 10;
        await BBCore.scrubBranch("local", branchId, maxSlot);

        // 1. 抓取該分支的所有紀錄
        const records = await BBCore.getAllRecordsForBranch("local", branchId);

        if (records.length === 0) {
            throw new Error("LOCAL DATA NOT FOUND. CHECKOUT FIRST.");
        }

        // 2. 上傳至伺服器
        const res = await fetch('/api/blackboard/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                branchId: branchId,
                branchName: branch,
                records: records
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || "UPLOAD FAILED.");
        }

        // Commit 成功後，將本地紀錄標記為 Synced 狀態
        // 這樣登出時 wipeSyncedData 就會將其抹除
        const syncedOwner = `local, online/${loggedInUser} [synced]`;
        await db.blackboard.where('owner').equals('local')
            .and(item => item.branchId === branchId)
            .modify({ owner: syncedOwner });

        return true;
    },

    /**
     * Checkout: 切換分支，若為雲端分支則強制從雲端抓取最新紀錄並合併至本地
     */
    async checkout(state, targetBranchId, targetOwner) {
        // 1. 如果目標是雲端分支，不論本地有無資料都先進行同步 (確保最新)
        if (targetOwner !== "local") {
            BBMessage.info("SYNCING BRANCH DATA FROM CLOUD...");
            const res = await fetch(`/api/blackboard/branches/${targetBranchId}`, {
                credentials: 'include'
            });

            if (res.ok) {
                const data = await res.json();
                // 獲取當前 UID
                const currentUser = localStorage.getItem("currentUser") || "unknown";
                
                // 轉換格式並存入本地，使用特殊 owner 標籤以支援登出抹除
                // 格式：local, online/uid [synced]
                const downloadRecords = data.records.map(r => ({
                    owner: `local, online/${r.owner} [synced]`, 
                    branchId: parseInt(r.branch_id),
                    branch: r.branch_name,
                    timestamp: parseInt(r.timestamp),
                    text: r.text,
                    bin: r.bin
                }));

                // 使用 bulkPut 強制覆蓋本地舊有的同 ID/timestamp 紀錄
                await db.blackboard.bulkPut(downloadRecords);

                // 同步後執行數據清洗
                await BBCore.scrubBranch("local", targetBranchId, state.maxSlot || 10);
            } else {
                console.warn("CLOUD SYNC FAILED. USING LOCAL CACHE.");
            }
        }

        // 2. 更新 state (編輯區永遠是 local)
        state.branchId = targetBranchId;
        state.owner = "local";
        state.currentHead = 0;

        // 嘗試更新 branchName (從剛同步完的 local 抓取最新一筆)
        const latest = await BBCore.getRecord("local", targetBranchId, 0);
        state.branch = latest?.branch ?? "";

        localStorage.setItem("currentBranchId", state.branchId);
        return true;
    }
};
