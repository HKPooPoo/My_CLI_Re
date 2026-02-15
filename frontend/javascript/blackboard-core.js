import db, { Dexie } from "./indexedDB.js";

export function getHKTTimestamp(dateInput) {
    const now = dateInput ? new Date(dateInput) : new Date();
    const hktOffset = 8 * 60 * 60 * 1000;
    const hktTime = new Date(now.getTime() + hktOffset);
    return hktTime.toISOString().replace('Z', '+08:00');
}

export const BBCore = {
    /**
     * 讀取特定索引的紀錄 (兼容本地與同步標籤)
     */
    async getRecord(owner, branchId, index) {
        // 如果 owner 是 local，我們也應該搜尋帶有同步標籤的紀錄
        if (owner === "local") {
            return await db.blackboard.where('owner').startsWith('local')
                .and(item => item.branchId === branchId)
                .reverse()
                .offset(index)
                .first();
        }

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
     * 更新紀錄的文字內容 (會同時更新 timestamp 以觸發同步偵測)
     */
    async updateText(owner, branchId, oldTimestamp, text) {
        // 尋找舊紀錄 (考慮所有 local 開頭的 owner)
        let oldRecord;
        if (owner === "local") {
            oldRecord = await db.blackboard.where('owner').startsWith('local')
                .and(item => item.branchId === branchId && item.timestamp === oldTimestamp)
                .first();
        } else {
            oldRecord = await db.blackboard.get({ owner, branchId, timestamp: oldTimestamp });
        }

        if (!oldRecord) return oldTimestamp;

        // 刪除舊紀錄
        await db.blackboard.delete([oldRecord.owner, branchId, oldTimestamp]);
        
        const newTimestamp = Date.now();
        
        // 保持原始 owner 標籤，但如果原本是 [synced]，則改為 [asynced]
        // 這確保了它依然不等於 "local"，登出時會被抹除
        let finalOwner = oldRecord.owner;
        if (finalOwner.includes("[synced]")) {
            finalOwner = finalOwner.replace("[synced]", "[asynced]");
        }

        await db.blackboard.add({
            ...oldRecord,
            owner: finalOwner,
            text: text,
            timestamp: newTimestamp
        });
        
        return newTimestamp;
    },

    /**
     * 分支改名 (對該 branchId 下的所有紀錄進行改名)
     */
    async renameBranch(owner, branchId, newName) {
        if (owner === "local") {
            return await db.blackboard.where('owner').startsWith('local')
                .and(item => item.branchId === branchId)
                .modify({ branch: newName });
        }

        return await db.blackboard
            .where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .modify({ branch: newName });
    },

    /**
     * 統計分支紀錄數量
     */
    async countRecords(owner, branchId) {
        if (owner === "local") {
            return await db.blackboard.where('owner').startsWith('local')
                .and(item => item.branchId === branchId)
                .count();
        }

        return await db.blackboard.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .count();
    },

    /**
     * 清理舊紀錄
     */
    async cleanupOldRecords(owner, branchId, maxSlot) {
        let collection;
        if (owner === "local") {
            collection = db.blackboard.where('owner').startsWith('local')
                .and(item => item.branchId === branchId);
        } else {
            collection = db.blackboard.where('[owner+branchId+timestamp]')
                .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey]);
        }

        const count = await collection.count();
        if (count > maxSlot) {
            // 注意：Dexie 的 and() 過濾器不能直接 limit/primaryKeys
            // 我們改用 toArray 取得鍵值後再刪除
            const records = await collection.sortBy('timestamp');
            const toDelete = records.slice(0, count - maxSlot);
            const keysToDelete = toDelete.map(r => [r.owner, r.branchId, r.timestamp]);
            await db.blackboard.bulkDelete(keysToDelete);
        }
    },

    /**
     * 獲取所有分支清單 (兼容本地與同步標籤)
     */
    async getAllBranches(owner) {
        const branches = new Map();

        let collection;
        if (owner === "local") {
            collection = db.blackboard.where('owner').startsWith('local');
        } else {
            collection = db.blackboard.where('owner').equals(owner);
        }

        await collection.each(record => {
            const branchId = record.branchId;
            const timestamp = record.timestamp;
            const existing = branches.get(branchId);
            if (!existing || timestamp > existing.lastUpdate) {
                branches.set(branchId, {
                    id: branchId,
                    name: record.branch,
                    owner: record.owner, // 保留原始 owner 標籤
                    lastUpdate: timestamp
                });
            }
        });

        const result = Array.from(branches.values()).map(info => ({
            id: info.id,
            name: info.name,
            owner: info.owner,
            lastUpdate: info.lastUpdate,
            displayTime: getHKTTimestamp(info.id)
        }));

        return result.sort((a, b) => b.lastUpdate - a.lastUpdate);
    },

    /**
     * 獲取一個分支的所有歷史紀錄 (用於 Commit 上傳)
     */
    async getAllRecordsForBranch(owner, branchId) {
        if (owner === "local") {
            return await db.blackboard.where('owner').startsWith('local')
                .and(item => item.branchId === branchId)
                .toArray();
        }

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
     * Stage 1: 清空歷史本身 (刪除所有節點並重置為一筆空白節點)
     */
    async clearBranchRecords(owner, branchId) {
        // 1. 獲取分支名稱
        const latest = await this.getRecord(owner, branchId, 0);
        const branchName = latest?.branch ?? "NAMELESS_BRANCH";

        // 2. 刪除該分支所有紀錄
        if (owner === "local") {
            const keys = await db.blackboard.where('owner').startsWith('local')
                .and(item => item.branchId === branchId)
                .primaryKeys();
            await db.blackboard.bulkDelete(keys);
        } else {
            const keys = await db.blackboard.where('[owner+branchId+timestamp]')
                .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
                .primaryKeys();
            await db.blackboard.bulkDelete(keys);
        }

        // 3. 建立一筆全新的空白起始點 (回歸純 local)
        return await this.addRecord("local", branchId, branchName, "");
    },

    /**
     * Stage 3: 徹底刪除本地分支的所有資料與索引
     */
    async deleteLocalBranch(owner, branchId) {
        if (owner === "local") {
            const keys = await db.blackboard.where('owner').startsWith('local')
                .and(item => item.branchId === branchId)
                .primaryKeys();
            return await db.blackboard.bulkDelete(keys);
        }

        const keys = await db.blackboard.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .primaryKeys();
        return await db.blackboard.bulkDelete(keys);
    },

    /**
     * 抹除所有非 local 的同步資料 (用於登出時保護隱私)
     */
    async wipeSyncedData() {
        // 刪除所有 owner 不等於 "local" 的紀錄
        const collection = db.blackboard.where('owner').notEqual('local');
        const keys = await collection.primaryKeys();
        return await db.blackboard.bulkDelete(keys);
    }
};
