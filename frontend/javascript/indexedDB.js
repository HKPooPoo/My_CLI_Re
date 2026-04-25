/**
 * Database Configuration - IndexedDB (Dexie)
 * =================================================================
 * 介紹：全站唯一的資料庫實體配置。
 * 職責：
 * 1. 引用本地 `dexie.js` 第三方庫 (已本地化)。
 * 2. 定義 `blackboardDB` 的資料表結構 (Schema)。
 * 3. 設定複合索引以優化檢索。
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
    blackboard: '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]',
    walkieTypie: '[branchId+timestamp], branchId, branch',
    fileBlobs: 'hash',
    broadcastBoards: '[localChannelId+timestamp], localChannelId',
    broadcastChannels: '++localId, &name, serverChannelId'
});

db.version(3).stores({
    blackboard:       '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]',
    walkieTypie:      '[branchId+timestamp], branchId, branch',
    broadcastBoards:  '[localChannelId+timestamp], localChannelId',
    broadcastChannels: '++localId, &name, serverChannelId',
    fileBlobs:        'hash, lastAccessed',
}).upgrade(tx => {
    const now = Date.now();
    return tx.table('fileBlobs').toCollection().modify(blob => {
        if (!blob.lastAccessed) blob.lastAccessed = now;
    });
});

db.version(4).stores({
    blackboard:        '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]',
    walkieTypie:       '[branchId+timestamp], branchId, branch',
    broadcastBoards:   '[localChannelId+timestamp], localChannelId',
    broadcastChannels: '++localId, name, serverChannelId',
    fileBlobs:         'hash, lastAccessed',
});

db.version(5).stores({
    blackboard:        '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]',
    walkieTypie:       '[branchId+timestamp], branchId, branch',
    broadcastBoards:   '[localChannelId+timestamp], localChannelId',
    broadcastChannels: '++localId, name, serverChannelId',
    fileBlobs:         'hash, lastAccessed, status',
});

// v6: snake_case migration — clear all data and rebuild with snake_case field names
db.version(6).stores({
    blackboard:          '[owner+branch_id+timestamp], owner, branch_id, [branch_id+timestamp]',
    walkie_typie:        '[branch_id+timestamp], branch_id, branch',
    broadcast_boards:    '[local_channel_id+timestamp], local_channel_id',
    broadcast_channels:  '++local_id, name, server_channel_id',
    file_blobs:          'hash, last_accessed, status',
    // Delete old tables
    walkieTypie:         null,
    broadcastBoards:     null,
    broadcastChannels:   null,
    fileBlobs:           null,
}).upgrade(tx => {
    // Clear all data from old tables (they'll be deleted by null above)
    // Clear new tables to start fresh
    return Promise.all([
        tx.table('blackboard').clear(),
        tx.table('broadcast_boards').clear(),
        tx.table('broadcast_channels').clear(),
        tx.table('file_blobs').clear(),
    ]);
});

// v7: Inbox subsystem. Inboxes are server-bound from creation (no
// local-only drafts as in BC), so server_inbox_id is the natural PK
// — no ++local_id indirection needed. inbox_submissions is keyed by
// the natural identity (inbox + sender uid), one row per pair.
db.version(7).stores({
    blackboard:          '[owner+branch_id+timestamp], owner, branch_id, [branch_id+timestamp]',
    walkie_typie:        '[branch_id+timestamp], branch_id, branch',
    broadcast_boards:    '[local_channel_id+timestamp], local_channel_id',
    broadcast_channels:  '++local_id, name, server_channel_id',
    file_blobs:          'hash, last_accessed, status',
    inboxes:             'server_inbox_id, name, last_signal',
    inbox_submissions:   '[server_inbox_id+sender_uid], server_inbox_id, sender_uid, updated_at',
});

export default db;
export { Dexie };
