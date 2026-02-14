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
            bin: "",
            createdAt: getHKTTimestamp()
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
     * 獲取所有分支清單 (優化查詢方式)
     */
    async getAllBranches(owner) {
        const branches = new Map();

        // 透過複合索引快速檢索該 owner 的所有紀錄
        await db.blackboard.where('[owner+branchId+timestamp]')
            .between([owner, Dexie.minKey, Dexie.minKey], [owner, Dexie.maxKey, Dexie.maxKey])
            .each(record => {
                const existing = branches.get(record.branchId);
                if (!existing || record.timestamp > existing.lastUpdate) {
                    branches.set(record.branchId, {
                        id: record.branchId,
                        name: record.branch,
                        owner: record.owner,
                        lastUpdate: record.timestamp,
                        displayTime: getHKTTimestamp(record.branchId)
                    });
                }
            });

        return Array.from(branches.values()).sort((a, b) => b.lastUpdate - a.lastUpdate);
    }
};
