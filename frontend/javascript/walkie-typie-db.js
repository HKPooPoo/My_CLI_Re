/**
 * Walkie-Typie DB - Dedicated IndexedDB Operations
 * =================================================================
 * 介紹：Walkie-Typie 專用的本地資料層，操作 Dexie 的 walkie_typie 表。
 * 特性：
 * 1. 無 owner 欄位 — WT 資料永遠只存在於本地。
 * 2. 主鍵為 [branch_id+timestamp]。
 * 3. 透過 `branch` 索引區分 "WE" / "THEY" 紀錄。
 * 依賴：indexedDB.js (Dexie instance)
 * =================================================================
 */

import db, { Dexie } from "./indexedDB.js";
export { getHKTTimestamp } from "./utils.js";

export const WTDb = {
    /**
     * 讀取特定索引的紀錄 (index 0 = 最新, 1 = 次新...)
     */
    async getRecord(branchId, index) {
        return await db.walkie_typie.where('[branch_id+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .reverse()
            .offset(index)
            .first();
    },

    /**
     * 新增一筆紀錄
     */
    async addRecord(branchId, branch, text = "", fileHash = null) {
        return await db.walkie_typie.add({
            branch_id: branchId,
            branch,
            timestamp: Date.now(),
            text,
            file_hash: fileHash
        });
    },

    /**
     * 新增一筆紀錄 (保留原始 timestamp，用於後端同步匯入)
     */
    async addRecordWithTimestamp(branchId, branch, text, timestamp, fileHash = null) {
        return await db.walkie_typie.put({
            branch_id: branchId,
            branch,
            timestamp,
            text,
            file_hash: fileHash
        });
    },

    /**
     * 更新紀錄的文字內容 — 刪除舊紀錄 + 以新 timestamp 添加
     */
    async updateText(branchId, oldTimestamp, text) {
        const oldRecord = await db.walkie_typie.get([branchId, oldTimestamp]);
        if (!oldRecord) return oldTimestamp;

        await db.walkie_typie.delete([branchId, oldTimestamp]);

        const newTimestamp = Math.max(Date.now(), oldTimestamp + 1);
        await db.walkie_typie.add({
            ...oldRecord,
            text: text,
            timestamp: newTimestamp
        });

        return newTimestamp;
    },

    /**
     * 更新紀錄的 file_hash 欄位 (檔案 hash)
     */
    async updateBin(branchId, timestamp, binData) {
        await db.walkie_typie.update([branchId, timestamp], { file_hash: binData });
    },

    /**
     * 統計分支紀錄數量
     */
    async countRecords(branchId) {
        return await db.walkie_typie.where('[branch_id+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .count();
    },

    /**
     * 清理溢出的舊紀錄
     */
    async cleanupOldRecords(branchId, maxSlot) {
        const records = await db.walkie_typie.where('[branch_id+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .sortBy('timestamp');

        if (records.length > maxSlot) {
            const toDelete = records.slice(0, records.length - maxSlot);
            const keysToDelete = toDelete.map(r => [r.branch_id, r.timestamp]);
            await db.walkie_typie.bulkDelete(keysToDelete);
        }
    },

    /**
     * 獲取一個分支的所有歷史紀錄 (新→舊排序)
     */
    async getAllRecordsForBranch(branchId) {
        return await db.walkie_typie.where('[branch_id+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .reverse()
            .toArray();
    },

    /**
     * 數據清洗：刪除空值紀錄 + 溢出清理
     */
    async scrubBranch(branchId, maxSlot) {
        const emptyKeys = await db.walkie_typie.where('[branch_id+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .filter(item => (!item.text || item.text.trim() === "") && !item.file_hash)
            .primaryKeys();

        if (emptyKeys.length > 0) {
            await db.walkie_typie.bulkDelete(emptyKeys);
        }

        if (maxSlot) {
            await this.cleanupOldRecords(branchId, maxSlot);
        }
    },

    /**
     * 清空指定分支的所有紀錄 (用於 CUT 連線)
     */
    async deleteBranchRecords(branchId) {
        const keys = await db.walkie_typie.where('[branch_id+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .primaryKeys();
        return await db.walkie_typie.bulkDelete(keys);
    },

    /**
     * 登出時清除所有 THEY 快取 (隱私保護)
     */
    async wipeTheyRecords() {
        const keys = await db.walkie_typie.where('branch').equals('THEY').primaryKeys();
        return await db.walkie_typie.bulkDelete(keys);
    }
};
