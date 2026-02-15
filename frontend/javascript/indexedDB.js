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
db.version(4).stores({
    /**
     * blackboard 表
     * 索引解釋：
     * [owner+branchId+timestamp] : 複合指標，用於快速定位特定用戶分支下的特定時間 Slot。
     */
    blackboard: '[owner+branchId+timestamp]'
});

export default db;
export { Dexie };