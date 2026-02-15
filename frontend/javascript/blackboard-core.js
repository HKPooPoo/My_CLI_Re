import db, { Dexie } from "./indexedDB.js";

export function getHKTTimestamp(dateInput) {
    const now = dateInput ? new Date(dateInput) : new Date();
    const hktOffset = 8 * 60 * 60 * 1000;
    const hktTime = new Date(now.getTime() + hktOffset);
    return hktTime.toISOString().replace('Z', '+08:00');
}

export const BBCore = {
    /**
     * 讀取特定索引的紀錄
     */
    async getRecord(owner, branchId, index) {
        return await db.blackboard.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .reverse()
            .offset(index)
            .first();
    },

    /**
     * 新增一筆紀錄
     */
    async addRecord(owner, branchId, branchName, text = "") {
        return await db.blackboard.add({
            owner,
            branchId,
            branch: branchName,
            timestamp: Date.now(),
            text,
            bin: null
        });
    },

    /**
     * 更新紀錄的文字內容 (使用複合鍵定位)
     */
    async updateText(owner, branchId, timestamp, text) {
        return await db.blackboard
            .where({ owner, branchId, timestamp })
            .modify({ text });
    },

    /**
     * 分支改名 (對該 branchId 下的所有紀錄進行改名)
     */
    async renameBranch(owner, branchId, newName) {
        return await db.blackboard
            .where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .modify({ branch: newName });
    },

    /**
     * 統計分支紀錄數量
     */
    async countRecords(owner, branchId) {
        return await db.blackboard.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .count();
    },

    /**
     * 清理舊紀錄
     */
    async cleanupOldRecords(owner, branchId, maxSlot) {
        const collection = db.blackboard.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey]);

        const count = await collection.count();
        if (count > maxSlot) {
            const keysToDelete = await collection.limit(count - maxSlot).primaryKeys();
            await db.blackboard.bulkDelete(keysToDelete);
        }
    },

    /**
     * 獲取所有分支清單 (效能優化版)
     */
    async getAllBranches(owner) {
        const branches = new Map();

        // 效能優化：僅遍歷索引鍵而不加載完整的紀錄物件 (Object Store)
        // 這在歷史紀錄眾多時能大幅減少 I/O 與內存壓力
        await db.blackboard.where('[owner+branchId+timestamp]')
            .between([owner, Dexie.minKey, Dexie.minKey], [owner, Dexie.maxKey, Dexie.maxKey])
            .until(() => false) // 遍歷所有匹配項
            .eachPrimaryKey((key) => {
                const [_, branchId, timestamp] = key;
                const existing = branches.get(branchId);
                if (!existing || timestamp > existing.lastUpdate) {
                    branches.set(branchId, {
                        id: branchId,
                        lastUpdate: timestamp
                    });
                }
            });

        // 為了拿到 branch 顯示名稱，我們只需獲取每個分支的最新一筆
        const result = [];
        for (const [id, info] of branches) {
            const latest = await this.getRecord(owner, id, 0);
            result.push({
                id: id,
                name: latest?.branch ?? "NAMELESS_BRANCH",
                owner: owner,
                lastUpdate: info.lastUpdate,
                displayTime: getHKTTimestamp(id)
            });
        }

        return result.sort((a, b) => b.lastUpdate - a.lastUpdate);
    },

    /**
     * 獲取一個分支的所有歷史紀錄 (用於 Commit 上傳)
     */
    async getAllRecordsForBranch(owner, branchId) {
        return await db.blackboard.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .toArray();
    },

    /**
     * Fork 分支：複製所有歷史紀錄到新 ID
     */
    async forkBranch(oldOwner, oldBranchId, newId) {
        const records = await this.getAllRecordsForBranch(oldOwner, oldBranchId);
        const newRecords = records.map(r => ({
            ...r,
            owner: "local",
            branchId: newId,
            branch: "" // Fork 出來的新分支預設無名稱
        }));
        return await db.blackboard.bulkAdd(newRecords);
    },

    /**
     * Stage 1: 清空特定分支的所有文字紀錄內容
     */
    async clearBranchRecords(owner, branchId) {
        // 更新該分支下所有紀錄的 text 為空，保留 index
        return await db.blackboard.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .modify({ text: "" });
    },

    /**
     * Stage 3: 徹底刪除本地分支的所有資料與索引
     */
    async deleteLocalBranch(owner, branchId) {
        const keys = await db.blackboard.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .primaryKeys();
        return await db.blackboard.bulkDelete(keys);
    }
};
