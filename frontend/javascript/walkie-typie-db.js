/**
 * Walkie-Typie DB - Dedicated IndexedDB Operations
 * =================================================================
 * 介紹：Walkie-Typie 專用的本地資料層，操作 Dexie 的 walkieTypie 表。
 * 職責：
 * 1. 與 BBCore 完全獨立，不共用 blackboard 表。
 * 2. 提供 WE/THEY 黑板的 CRUD 操作。
 * 3. 支援歷史翻閱 (getRecord by index)。
 * 依賴：indexedDB.js (Dexie instance)
 * =================================================================
 */

import db, { Dexie } from "./indexedDB.js";

export const WTDb = {
    /**
     * 讀取特定索引的紀錄
     */
    async getRecord(owner, branchId, index) {
        if (owner === "local") {
            return await db.walkieTypie.where('[branchId+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'))
                .reverse()
                .offset(index)
                .first();
        }

        return await db.walkieTypie.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .reverse()
            .offset(index)
            .first();
    },

    /**
     * 新增一筆紀錄
     */
    async addRecord(owner, branchId, branchName, text = "") {
        return await db.walkieTypie.add({
            owner,
            branchId,
            branch: branchName,
            timestamp: Date.now(),
            text,
            bin: null
        });
    },

    /**
     * 更新紀錄的文字內容 (會同時更新 timestamp)
     */
    async updateText(owner, branchId, oldTimestamp, text) {
        let oldRecord;
        if (owner === "local") {
            oldRecord = await db.walkieTypie.where('[branchId+timestamp]')
                .equals([branchId, oldTimestamp])
                .and(item => item.owner.startsWith('local'))
                .first();
        } else {
            oldRecord = await db.walkieTypie.get({ owner, branchId, timestamp: oldTimestamp });
        }

        if (!oldRecord) return oldTimestamp;

        await db.walkieTypie.delete([oldRecord.owner, branchId, oldTimestamp]);

        const newTimestamp = Date.now();

        let finalOwner = oldRecord.owner;
        if (finalOwner.includes("[synced]")) {
            finalOwner = finalOwner.replace("[synced]", "[asynced]");
        }

        await db.walkieTypie.add({
            ...oldRecord,
            owner: finalOwner,
            text: text,
            timestamp: newTimestamp
        });

        return newTimestamp;
    },

    /**
     * 統計分支紀錄數量
     */
    async countRecords(owner, branchId) {
        if (owner === "local") {
            return await db.walkieTypie.where('[branchId+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'))
                .count();
        }

        return await db.walkieTypie.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .count();
    },

    /**
     * 清理溢出的舊紀錄
     */
    async cleanupOldRecords(owner, branchId, maxSlot) {
        let collection;
        if (owner === "local") {
            collection = db.walkieTypie.where('[branchId+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'));
        } else {
            collection = db.walkieTypie.where('[owner+branchId+timestamp]')
                .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey]);
        }

        const count = await collection.count();
        if (count > maxSlot) {
            const records = await collection.sortBy('timestamp');
            const toDelete = records.slice(0, count - maxSlot);
            const keysToDelete = toDelete.map(r => [r.owner, r.branchId, r.timestamp]);
            await db.walkieTypie.bulkDelete(keysToDelete);
        }
    },

    /**
     * 獲取一個分支的所有歷史紀錄
     */
    async getAllRecordsForBranch(owner, branchId) {
        if (owner === "local") {
            return await db.walkieTypie.where('[branchId+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'))
                .reverse()
                .toArray();
        }

        return await db.walkieTypie.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .toArray();
    },

    /**
     * 數據清洗：刪除空值紀錄並強制執行容量限制
     */
    async scrubBranch(owner, branchId, maxSlot) {
        let collection;
        if (owner === "local") {
            collection = db.walkieTypie.where('[branchId+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'));
        } else {
            collection = db.walkieTypie.where('[owner+branchId+timestamp]')
                .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey]);
        }

        // 1. 刪除空值紀錄
        const emptyKeys = await collection
            .filter(item => !item.text || item.text.trim() === "")
            .primaryKeys();

        if (emptyKeys.length > 0) {
            await db.walkieTypie.bulkDelete(emptyKeys);
        }

        // 2. 執行溢出清理
        if (maxSlot) {
            await this.cleanupOldRecords(owner, branchId, maxSlot);
        }
    },

    /**
     * 清空分支所有紀錄 (用於刪除連線時清除本地快取)
     */
    async deleteBranchRecords(owner, branchId) {
        if (owner === "local") {
            const keys = await db.walkieTypie.where('[branchId+timestamp]')
                .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
                .and(item => item.owner.startsWith('local'))
                .primaryKeys();
            return await db.walkieTypie.bulkDelete(keys);
        }

        const keys = await db.walkieTypie.where('[owner+branchId+timestamp]')
            .between([owner, branchId, Dexie.minKey], [owner, branchId, Dexie.maxKey])
            .primaryKeys();
        return await db.walkieTypie.bulkDelete(keys);
    },

    /**
     * 抹除所有非 local 的同步資料 (登出時保護隱私)
     */
    async wipeSyncedData() {
        const collection = db.walkieTypie.where('owner').notEqual('local');
        const keys = await collection.primaryKeys();
        return await db.walkieTypie.bulkDelete(keys);
    }
};
