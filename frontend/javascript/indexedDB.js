/**
 * Database Configuration - IndexedDB (Dexie)
 * =================================================================
 * 介紹：全站唯一的資料庫實體配置。
 * 職責：
 * 1. 引用本地 `dexie.js` 第三方庫 (已本地化)。
 * 2. 定義 `blackboardDB` 的資料表結構 (Schema)。
 * 3. 設定複合索引 `[owner+branchId+timestamp]` 以優化黑板歷程檢索。
 * 依賴：vendor/dexie.js
 * =================================================================
 */

import Dexie from './vendor/dexie.js';

const db = new Dexie('blackboardDB');

// --- 版本與 Schema 定義 ---
db.version(1).stores({
    blackboard: '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]',
    walkieTypie: '[branchId+timestamp], branchId, branch',
    fileBlobs: 'hash'
});

db.version(2).stores({
    // Carry forward all v1 stores unchanged
    blackboard: '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]',
    walkieTypie: '[branchId+timestamp], branchId, branch',
    fileBlobs: 'hash',

    /**
     * broadcastBoards 表 (BC 頻道內容歷史)
     * 主鍵：[localChannelId+timestamp]
     * 特性：timestamp 是創建時間，永不更新（BC 排序機制）
     */
    broadcastBoards: '[localChannelId+timestamp], localChannelId',

    /**
     * broadcastChannels 表 (BC 本地頻道元數據)
     * 主鍵：++localId（自動遞增）
     * 索引：name（唯一）, serverChannelId（cast 後才有值）
     */
    broadcastChannels: '++localId, &name, serverChannelId'
});

export default db;
export { Dexie };