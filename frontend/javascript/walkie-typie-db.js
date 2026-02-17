/**
 * Walkie-Typie DB - Dedicated IndexedDB Operations
 * =================================================================
 * 介紹：Walkie-Typie 專用的本地資料層，操作 Dexie 的 walkieTypie 表。
 * 特性：
 * 1. 無 owner 欄位 — WT 資料永遠只存在於本地。
 * 2. 主鍵為 [branchId+timestamp]。
 * 3. 透過 `branch` 索引區分 "WE" / "THEY" 紀錄。
 * 依賴：indexedDB.js (Dexie instance)
 * =================================================================
 */

import db, { Dexie } from "./indexedDB.js";

/**
 * 將 Date.now() 格式化為 HKT ISO 字串 (自主，不依賴 blackboard-core)
 */
export function getHKTTimestamp(dateInput) {
    const now = dateInput ? new Date(dateInput) : new Date();
    const hktOffset = 8 * 60 * 60 * 1000;
    const hktTime = new Date(now.getTime() + hktOffset);
    return hktTime.toISOString().replace('Z', '+08:00');
}

export const WTDb = {
    /**
     * 讀取特定索引的紀錄 (index 0 = 最新, 1 = 次新...)
     */
    async getRecord(branchId, index) {
        return await db.walkieTypie.where('[branchId+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .reverse()
            .offset(index)
            .first();
    },

    /**
     * 新增一筆紀錄
     */
    async addRecord(branchId, branch, text = "") {
        return await db.walkieTypie.add({
            branchId,
            branch,
            timestamp: Date.now(),
            text,
            bin: null
        });
    },

    /**
     * 新增一筆紀錄 (保留原始 timestamp，用於後端同步匯入)
     */
    async addRecordWithTimestamp(branchId, branch, text, timestamp) {
        return await db.walkieTypie.put({
            branchId,
            branch,
            timestamp,
            text,
            bin: null
        });
    },

    /**
     * 更新紀錄的文字內容 — 刪除舊紀錄 + 以新 timestamp 添加
     */
    async updateText(branchId, oldTimestamp, text) {
        const oldRecord = await db.walkieTypie.get([branchId, oldTimestamp]);
        if (!oldRecord) return oldTimestamp;

        await db.walkieTypie.delete([branchId, oldTimestamp]);

        const newTimestamp = Date.now();
        await db.walkieTypie.add({
            ...oldRecord,
            text: text,
            timestamp: newTimestamp
        });

        return newTimestamp;
    },

    /**
     * 統計分支紀錄數量
     */
    async countRecords(branchId) {
        return await db.walkieTypie.where('[branchId+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .count();
    },

    /**
     * 清理溢出的舊紀錄
     */
    async cleanupOldRecords(branchId, maxSlot) {
        const records = await db.walkieTypie.where('[branchId+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .sortBy('timestamp');

        if (records.length > maxSlot) {
            const toDelete = records.slice(0, records.length - maxSlot);
            const keysToDelete = toDelete.map(r => [r.branchId, r.timestamp]);
            await db.walkieTypie.bulkDelete(keysToDelete);
        }
    },

    /**
     * 獲取一個分支的所有歷史紀錄 (新→舊排序)
     */
    async getAllRecordsForBranch(branchId) {
        return await db.walkieTypie.where('[branchId+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .reverse()
            .toArray();
    },

    /**
     * 數據清洗：刪除空值紀錄 + 溢出清理
     */
    async scrubBranch(branchId, maxSlot) {
        // 刪除空值紀錄
        const emptyKeys = await db.walkieTypie.where('[branchId+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .filter(item => !item.text || item.text.trim() === "")
            .primaryKeys();

        if (emptyKeys.length > 0) {
            await db.walkieTypie.bulkDelete(emptyKeys);
        }

        // 溢出清理
        if (maxSlot) {
            await this.cleanupOldRecords(branchId, maxSlot);
        }
    },

    /**
     * 清空指定分支的所有紀錄 (用於 CUT 連線)
     */
    async deleteBranchRecords(branchId) {
        const keys = await db.walkieTypie.where('[branchId+timestamp]')
            .between([branchId, Dexie.minKey], [branchId, Dexie.maxKey])
            .primaryKeys();
        return await db.walkieTypie.bulkDelete(keys);
    },

    /**
     * 登出時清除所有 THEY 快取 (隱私保護)
     */
    async wipeTheyRecords() {
        const keys = await db.walkieTypie.where('branch').equals('THEY').primaryKeys();
        return await db.walkieTypie.bulkDelete(keys);
    }
};
