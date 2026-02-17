/**
 * Walkie-Typie VCS - Version Control Logic
 * =================================================================
 * 介紹：Walkie-Typie 專用的版本控制邏輯層。
 * 特性：
 * 1. Push/Pull 支援 readOnly 參數 — THEY 側只讀瀏覽。
 * 2. readOnly=true 時：不存檔、不建虛擬新頁面。
 * 3. State 無 owner 欄位。
 * 依賴：walkie-typie-db.js, walkie-typie-service.js
 * =================================================================
 */

import { WTDb } from "./walkie-typie-db.js";
import { WalkieTypieService } from "./services/walkie-typie-service.js";

export const WTVCS = {
    /**
     * Push — 向上翻頁或建立新頁面
     * @param {Object} state   VCS 狀態物件
     * @param {string} currentText   當前 textarea 的文字
     * @param {boolean} readOnly  THEY 側: true (不建虛擬新頁, 不存檔)
     */
    async push(state, currentText, readOnly = false) {
        if (state.isVirtual) return false;

        if (!readOnly) {
            await this.save(state, currentText);
        }

        await WTDb.scrubBranch(state.branchId, state.maxSlot);

        if (state.currentHead > 0) {
            state.currentHead--;
            return true;
        }

        // Head 0 且非唯讀 → 進入虛擬新頁面
        if (!readOnly) {
            state.isVirtual = true;
            return true;
        }

        return false;
    },

    /**
     * Pull — 向下翻閱歷史
     * @param {boolean} readOnly  THEY 側: true (不存檔)
     */
    async pull(state, currentText, readOnly = false) {
        if (state.isVirtual) {
            state.isVirtual = false;
            if (!readOnly && currentText && currentText.trim()) {
                await this.save(state, currentText);
            } else {
                return true; // 取消虛擬頁
            }
        }

        if (!readOnly) {
            await this.save(state, currentText);
        }

        await WTDb.scrubBranch(state.branchId, state.maxSlot);

        const count = await WTDb.countRecords(state.branchId);

        if (state.currentHead < count - 1) {
            state.currentHead++;
            return true;
        }

        return false;
    },

    /**
     * Save — 自動儲存
     */
    async save(state, text) {
        if (state.isVirtual) {
            if (text && text.trim()) {
                await WTDb.addRecord(state.branchId, state.branch, text);
                state.isVirtual = false;
                state.currentHead = 0;
                await WTDb.cleanupOldRecords(state.branchId, state.maxSlot);
            }
            return;
        }

        const entry = await WTDb.getRecord(state.branchId, state.currentHead);

        if (entry) {
            if (entry.text !== text) {
                // 如果在歷史頁面編輯，檢查並清除空白的 Head 0
                if (state.currentHead > 0) {
                    const head0 = await WTDb.getRecord(state.branchId, 0);
                    if (head0 && (!head0.text || head0.text.trim() === "")) {
                        await db.walkieTypie.delete([head0.branchId, head0.timestamp]);
                    }
                }

                await WTDb.updateText(state.branchId, entry.timestamp, text);
                state.currentHead = 0; // 編輯後置頂
            }
        } else if (state.currentHead === 0) {
            if (text && text.trim()) {
                await WTDb.addRecord(state.branchId, state.branch, text);
            }
        }
    },

    /**
     * Commit — 上傳分支紀錄到 WT 後端端點
     */
    async commit(branchMeta) {
        const { branchId, branch } = branchMeta;

        const loggedInUser = localStorage.getItem("currentUser");
        if (!loggedInUser) throw new Error("LOGIN REQUIRED FOR COMMIT.");

        await WTDb.scrubBranch(branchId, 10);

        let records = await WTDb.getAllRecordsForBranch(branchId);
        records = records.filter(r => r.text && r.text.trim() !== "");

        if (records.length === 0) {
            throw new Error("LOCAL DATA NOT FOUND OR EMPTY.");
        }

        await WalkieTypieService.commitBoard({
            branchId: branchId,
            branchName: branch,
            records: records
        });

        return true;
    }
};

// Import db for direct operations in save()
import db from "./indexedDB.js";
