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

db.version(3).stores({
    // All v1+v2 stores carried forward unchanged:
    blackboard:       '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]',
    walkieTypie:      '[branchId+timestamp], branchId, branch',
    broadcastBoards:  '[localChannelId+timestamp], localChannelId',
    broadcastChannels: '++localId, &name, serverChannelId',
    // fileBlobs gains lastAccessed index for LRU eviction:
    fileBlobs:        'hash, lastAccessed',
}).upgrade(tx => {
    const now = Date.now();
    return tx.table('fileBlobs').toCollection().modify(blob => {
        if (!blob.lastAccessed) blob.lastAccessed = now;
    });
});

// v4: drop the unique constraint on broadcastChannels.name.
// The &name unique index caused ConstraintErrors when two create actions
// fired within the same millisecond (MultiStepButton resets synchronously
// so a second click can race the first async action).
db.version(4).stores({
    blackboard:        '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]',
    walkieTypie:       '[branchId+timestamp], branchId, branch',
    broadcastBoards:   '[localChannelId+timestamp], localChannelId',
    broadcastChannels: '++localId, name, serverChannelId',
    fileBlobs:         'hash, lastAccessed',
});

// v5: add status index to fileBlobs for optimized _pruneFileBlobs queries
db.version(5).stores({
    blackboard:        '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]',
    walkieTypie:       '[branchId+timestamp], branchId, branch',
    broadcastBoards:   '[localChannelId+timestamp], localChannelId',
    broadcastChannels: '++localId, name, serverChannelId',
    fileBlobs:         'hash, lastAccessed, status',
});

export default db;
export { Dexie };