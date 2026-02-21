/**
 * Broadcast DB - IndexedDB Operations
 * =================================================================
 * 介紹：BC 專用的本地資料層。操作 Dexie 的 broadcastBoards 與 broadcastChannels 表。
 *
 * 核心設計原則（BC VCS vs BB VCS）：
 * - BB: updateText 刪除舊紀錄並以新 timestamp 重新插入 → 記錄跳到 Head 0
 * - BC: updateTextInPlace 直接更新 text 欄位，timestamp 永不改變 → 位置固定不動
 * - BC 無空白頁清理（scrubBranch）
 *
 * 依賴：indexedDB.js (Dexie instance)
 * =================================================================
 */

import db, { Dexie } from './indexedDB.js';

export function getHKTTimestamp(dateInput) {
    const now = dateInput ? new Date(dateInput) : new Date();
    const hktOffset = 8 * 60 * 60 * 1000;
    const hktTime = new Date(now.getTime() + hktOffset);
    return hktTime.toISOString().replace('Z', '+08:00');
}

// =============================================================
//  Board Operations (broadcastBoards)
// =============================================================

export const BCDb = {
    /**
     * 讀取特定索引的 Board 紀錄（index 0 = 最新創建）
     */
    async getRecord(localChannelId, index) {
        return await db.broadcastBoards
            .where('[localChannelId+timestamp]')
            .between([localChannelId, Dexie.minKey], [localChannelId, Dexie.maxKey])
            .reverse()   // newest created = index 0
            .offset(index)
            .first();
    },

    /**
     * 新增一筆 Board 紀錄，timestamp 為創建時間
     */
    async addRecord(localChannelId, text = '', bin = null) {
        return await db.broadcastBoards.add({
            localChannelId,
            timestamp: Date.now(),  // creation timestamp — never changes
            text,
            bin
        });
    },

    /**
     * 原地更新文字（BC 核心機制：timestamp 永不改變，排序位置固定）
     */
    async updateTextInPlace(localChannelId, timestamp, text) {
        await db.broadcastBoards.update([localChannelId, timestamp], { text });
    },

    /**
     * 原地更新 bin（附件，同樣不改 timestamp）
     */
    async updateBinInPlace(localChannelId, timestamp, binData) {
        await db.broadcastBoards.update([localChannelId, timestamp], { bin: binData });
    },

    /**
     * 統計某頻道的 Board 紀錄數量
     */
    async countRecords(localChannelId) {
        return await db.broadcastBoards
            .where('[localChannelId+timestamp]')
            .between([localChannelId, Dexie.minKey], [localChannelId, Dexie.maxKey])
            .count();
    },

    /**
     * 取得某頻道的所有 Board 紀錄（最新創建在前，供 CAST 上傳用）
     */
    async getAllRecords(localChannelId) {
        return await db.broadcastBoards
            .where('[localChannelId+timestamp]')
            .between([localChannelId, Dexie.minKey], [localChannelId, Dexie.maxKey])
            .reverse()
            .toArray();
    },

    /**
     * 刪除某頻道的所有 Board 紀錄（DELETE 頻道時使用）
     */
    async deleteAllRecords(localChannelId) {
        const keys = await db.broadcastBoards
            .where('[localChannelId+timestamp]')
            .between([localChannelId, Dexie.minKey], [localChannelId, Dexie.maxKey])
            .primaryKeys();
        return await db.broadcastBoards.bulkDelete(keys);
    },

    /**
     * 匯入後端 Board 紀錄（CAST 後本地同步，保留原始 timestamp）
     */
    async importRecords(localChannelId, serverRecords) {
        const rows = serverRecords.map(r => ({
            localChannelId,
            timestamp: parseInt(r.timestamp),
            text: r.text || '',
            bin: r.bin ? {
                hash: r.bin,
                name: r.file_name || 'unknown',
                size: r.file_size || 0,
                mime: r.file_mime || 'application/octet-stream'
            } : null
        }));
        return await db.broadcastBoards.bulkPut(rows);
    }
};

// =============================================================
//  Channel Metadata Operations (broadcastChannels)
// =============================================================

export const BCMeta = {
    /**
     * 創建本地頻道元數據（CREATE 操作）
     * 返回 localId（Dexie 自動遞增 PK）
     */
    async createChannel(name) {
        return await db.broadcastChannels.add({
            name,
            serverChannelId: null,  // null until CAST
            ownerUid: localStorage.getItem('currentUser') || '',
            lastSignal: Date.now()
        });
    },

    /**
     * 讀取所有本地頻道（含未 cast 的）
     */
    async getAllChannels() {
        return await db.broadcastChannels.toArray();
    },

    /**
     * 按 localId 讀取單一頻道
     */
    async getChannel(localId) {
        return await db.broadcastChannels.get(localId);
    },

    /**
     * 按 serverChannelId 找到本地對應記錄
     */
    async getChannelByServerId(serverChannelId) {
        return await db.broadcastChannels
            .where('serverChannelId')
            .equals(serverChannelId)
            .first();
    },

    /**
     * 按 name 找到本地頻道
     */
    async getChannelByName(name) {
        return await db.broadcastChannels.where('name').equals(name).first();
    },

    /**
     * 更新頻道名稱（本地）
     */
    async renameChannel(localId, newName) {
        await db.broadcastChannels.update(localId, { name: newName });
    },

    /**
     * CAST 成功後：儲存 serverChannelId 映射
     */
    async setServerChannelId(localId, serverChannelId) {
        await db.broadcastChannels.update(localId, { serverChannelId });
    },

    /**
     * 更新 lastSignal（CAST 時同步）
     */
    async updateLastSignal(localId, lastSignal) {
        await db.broadcastChannels.update(localId, { lastSignal });
    },

    /**
     * 刪除頻道元數據及其所有 Board 紀錄
     */
    async deleteChannel(localId) {
        await BCDb.deleteAllRecords(localId);
        await db.broadcastChannels.delete(localId);
    }
};
