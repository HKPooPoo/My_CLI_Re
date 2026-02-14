import db, { Dexie } from "./indexedDB.js";

/**
 * 取得香港時間戳記 (ISO 格式)
 */
export function getHKTTimestamp(dateInput) {
    const now = dateInput ? new Date(dateInput) : new Date();
    const hktOffset = 8 * 60 * 60 * 1000;
    const hktTime = new Date(now.getTime() + hktOffset);
    return hktTime.toISOString().replace('Z', '+08:00');
}

/**
 * Blackboard 核心數據操作層
 */
export const BBCore = {
    /**
     * 讀取特定索引的紀錄
     */
    async getRecord(owner, branch, index) {
        return await db.blackboard.where('[owner+branch+timestamp]')
            .between(
                [owner, branch, Dexie.minKey],
                [owner, branch, Dexie.maxKey]
            )
            .reverse()
            .offset(index)
            .first();
    },

    /**
     * 新增一筆空白紀錄
     */
    async addEmptyRecord(owner, branch) {
        return await db.blackboard.add({
            owner,
            branch,
            timestamp: Date.now(),
            text: "",
            bin: "",
            createdAt: getHKTTimestamp()
        });
    },

    /**
     * 更新現有紀錄的文字內容
     */
    async updateText(id, text) {
        return await db.blackboard.update(id, { text });
    },

    /**
     * 獲取分支紀錄總數
     */
    async countRecords(owner, branch) {
        return await db.blackboard.where('[owner+branch+timestamp]')
            .between(
                [owner, branch, Dexie.minKey],
                [owner, branch, Dexie.maxKey]
            )
            .count();
    },

    /**
     * 清理舊紀錄 (超過 maxSlot 的部分)
     */
    async cleanupOldRecords(owner, branch, maxSlot) {
        const collection = db.blackboard.where('[owner+branch+timestamp]')
            .between(
                [owner, branch, Dexie.minKey],
                [owner, branch, Dexie.maxKey]
            );

        const count = await collection.count();
        if (count > maxSlot) {
            const keysToDelete = await collection.limit(count - maxSlot).primaryKeys();
            await db.blackboard.bulkDelete(keysToDelete);
        }
    },

    /**
     * 獲取使用者的全部分支清單與其最後更新時間
     */
    async getAllBranches(owner) {
        const branches = new Map();

        await db.blackboard.where('[owner+branch+timestamp]')
            .between([owner, Dexie.minKey, Dexie.minKey], [owner, Dexie.maxKey, Dexie.maxKey])
            .each(record => {
                // 我們取該分支下最新的一筆紀錄作為顯示時間
                const existing = branches.get(record.branch);
                if (!existing || record.timestamp > existing.timestamp) {
                    branches.set(record.branch, {
                        name: record.branch,
                        owner: record.owner,
                        timestamp: record.timestamp,
                        displayTime: record.createdAt || getHKTTimestamp(record.timestamp)
                    });
                }
            });

        return Array.from(branches.values()).sort((a, b) => b.timestamp - a.timestamp);
    }
};
