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
db.version(7).stores({
    blackboard: '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]'
});

db.version(8).stores({
    /**
     * blackboard 表
     * 欄位：[owner+branchId+timestamp], branch_name, text, bin
     * 索引：owner (用於登出抹除), branchId (用於快速查詢)
     * 新增索引：[branchId+timestamp] (用於解決 local(synced) 與 local 混合時的排序問題)
     */
    blackboard: '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]',

    /**
     * walkieTypie 表 (從 blackboard 分離)
     * 結構相同，但完全獨立的儲存空間
     * 用於 Walkie-Typie 的 WE/THEY 雙面板歷史紀錄
     */
    walkieTypie: '[owner+branchId+timestamp], owner, branchId, [branchId+timestamp]'
});

export default db;
export { Dexie };