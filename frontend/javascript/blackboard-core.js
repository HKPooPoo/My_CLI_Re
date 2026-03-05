import db, { Dexie } from "./indexedDB.js";
export { getHKTTimestamp } from "./utils.js";
import { getHKTTimestamp } from "./utils.js";

export const BBCore = {
    /**
     * 讀取特定索引的紀錄 (兼容本地與同步標籤)
     */
    async getRecord(owner, branchId, index) {
        // 如果 owner 是 local，我們也應該搜尋帶有同步標籤的紀錄
        if (owner === "local") {
            // [XP-Fix]: 使用 [branch_id+timestamp] 複合索引確保時間排序正確，不受 owner 字串影響
            return await db.blackboard.where('[branch_id+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'))
                .reverse()
                .offset(index)
                .first();
        }

        return await db.blackboard.where('[owner+branch_id+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .reverse()
            .offset(index)
            .first();
    },

    /**
     * 新增一筆紀錄
     */
    async addRecord(owner, branchId, branchName, text = "", fileHash = null) {
        return await db.blackboard.add({
            owner,
            branch_id: branchId,
            branch: branchName,
            timestamp: Date.now(),
            text,
            file_hash: fileHash
        });
    },

    /**
     * 更新紀錄的文字內容 (不更新 timestamp，位置不變)
     */
    async updateTextInPlace(owner, branchId, timestamp, text) {
        if (owner === "local") {
            const record = await db.blackboard.where('[branch_id+timestamp]')
                .equals([branchId, timestamp])
                .and(item => item.owner.startsWith('local'))
                .first();
            if (!record) return;
            let finalOwner = record.owner;
            if (finalOwner.includes("[synced]")) {
                finalOwner = finalOwner.replace("[synced]", "[asynced]");
            }
            await db.blackboard.update([record.owner, branchId, timestamp], { text, owner: finalOwner });
        } else {
            await db.blackboard.update([owner, branchId, timestamp], { text });
        }
    },

    /**
     * 更新紀錄的文字內容 (會同時更新 timestamp 以觸發同步偵測)
     */
    async updateText(owner, branchId, oldTimestamp, text) {
        // 尋找舊紀錄 (考慮所有 local 開頭的 owner)
        let oldRecord;
        if (owner === "local") {
            // [XP-Fix]: 使用 [branch_id+timestamp] 準確定位
            oldRecord = await db.blackboard.where('[branch_id+timestamp]')
                .equals([branchId, oldTimestamp])
                .and(item => item.owner.startsWith('local'))
                .first();
        } else {
            oldRecord = await db.blackboard.get({ owner, branch_id: branchId, timestamp: oldTimestamp });
        }

        if (!oldRecord) return oldTimestamp;

        // 刪除舊紀錄
        await db.blackboard.delete([oldRecord.owner, branchId, oldTimestamp]);

        const newTimestamp = Math.max(Date.now(), oldTimestamp + 1);

        // 保持原始 owner 標籤，但如果原本是 [synced]，則改為 [asynced]
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
     * 分支改名 (對該 branch_id 下的所有紀錄進行改名)
     */
    async renameBranch(owner, branchId, newName) {
        if (owner === "local") {
            return await db.blackboard.where('[branch_id+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'))
                .modify({ branch: newName });
        }

        return await db.blackboard
            .where('[owner+branch_id+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .modify({ branch: newName });
    },

    /**
     * 統計分支紀錄數量
     */
    async countRecords(owner, branchId) {
        if (owner === "local") {
            return await db.blackboard.where('[branch_id+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'))
                .count();
        }

        return await db.blackboard.where('[owner+branch_id+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .count();
    },

    /**
     * 清理舊紀錄
     */
    async cleanupOldRecords(owner, branchId, maxSlot) {
        let collection;
        if (owner === "local") {
            collection = db.blackboard.where('[branch_id+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'));
        } else {
            collection = db.blackboard.where('[owner+branch_id+timestamp]')
                .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey]);
        }

        const count = await collection.count();
        if (count > maxSlot) {
            const records = await collection.sortBy('timestamp');
            const toDelete = records.slice(0, count - maxSlot);
            const keysToDelete = toDelete.map(r => [r.owner, r.branch_id, r.timestamp]);
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
            const branchId = record.branch_id;
            const timestamp = record.timestamp;
            const existing = branches.get(branchId);
            if (!existing || timestamp > existing.lastUpdate) {
                branches.set(branchId, {
                    id: branchId,
                    name: record.branch,
                    owner: record.owner,
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
            return await db.blackboard.where('[branch_id+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'))
                .reverse()
                .toArray();
        }

        return await db.blackboard.where('[owner+branch_id+timestamp]')
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
            branch_id: newId,
            branch: ""
        }));
        return await db.blackboard.bulkAdd(newRecords);
    },

    /**
     * Stage 1: 清空歷史本身 (刪除所有節點並重置為一筆空白節點)
     */
    async clearBranchRecords(owner, branchId) {
        const latest = await this.getRecord(owner, branchId, 0);
        const branchName = latest?.branch ?? "NAMELESS_BRANCH";

        if (owner === "local") {
            const keys = await db.blackboard.where('[branch_id+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'))
                .primaryKeys();
            await db.blackboard.bulkDelete(keys);
        } else {
            const keys = await db.blackboard.where('[owner+branch_id+timestamp]')
                .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
                .primaryKeys();
            await db.blackboard.bulkDelete(keys);
        }

        return await this.addRecord("local", branchId, branchName, "");
    },

    /**
     * Stage 3: 徹底刪除本地分支的所有資料與索引
     */
    async deleteLocalBranch(owner, branchId) {
        if (owner === "local") {
            const keys = await db.blackboard.where('[branch_id+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'))
                .primaryKeys();
            return await db.blackboard.bulkDelete(keys);
        }

        const keys = await db.blackboard.where('[owner+branch_id+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .primaryKeys();
        return await db.blackboard.bulkDelete(keys);
    },

    /**
     * 抹除所有非 local 的同步資料 (用於登出時保護隱私)
     */
    async wipeSyncedData() {
        const collection = db.blackboard.where('owner').notEqual('local');
        const keys = await collection.primaryKeys();
        return await db.blackboard.bulkDelete(keys);
    },

    /**
     * 數據清洗：去重、刪除空值紀錄並強制執行容量限制
     */
    async scrubBranch(owner, branchId, maxSlot) {
        let collection;
        if (owner === "local") {
            collection = db.blackboard.where('[branch_id+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'));
        } else {
            collection = db.blackboard.where('[owner+branch_id+timestamp]')
                .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey]);
        }

        // 0. 去重：刪除 owner 變體產生的重複紀錄 (同 branch_id+timestamp，不同 owner)
        if (owner === "local") {
            const all = await collection.toArray();
            const seen = new Map();
            const dupKeys = [];
            for (const r of all) {
                const key = r.timestamp;
                const existing = seen.get(key);
                if (existing) {
                    // 保留 owner 較長者（較具體的同步標籤）
                    const discard = r.owner.length >= existing.owner.length ? existing : r;
                    dupKeys.push([discard.owner, discard.branch_id, discard.timestamp]);
                    if (r.owner.length > existing.owner.length) seen.set(key, r);
                } else {
                    seen.set(key, r);
                }
            }
            if (dupKeys.length > 0) {
                await db.blackboard.bulkDelete(dupKeys);
            }
        }

        // 1. 刪除空值紀錄 (text 為空或全空白) — 需重新查詢（去重後狀態已變）
        let cleanCollection;
        if (owner === "local") {
            cleanCollection = db.blackboard.where('[branch_id+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'));
        } else {
            cleanCollection = db.blackboard.where('[owner+branch_id+timestamp]')
                .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey]);
        }

        const emptyKeys = await cleanCollection
            .filter(item => (!item.text || item.text.trim() === "") && !item.file_hash)
            .primaryKeys();

        if (emptyKeys.length > 0) {
            await db.blackboard.bulkDelete(emptyKeys);
        }

        // 2. 執行溢出清理
        if (maxSlot) {
            await this.cleanupOldRecords(owner, branchId, maxSlot);
        }
    }
};
