/**
 * Walkie-Typie VCS - Version Control Logic
 * =================================================================
 * 介紹：Walkie-Typie 專用的版本控制邏輯層。
 * 職責：
 * 1. 與 BBVCS 完全獨立，使用 WTDb 而非 BBCore。
 * 2. Push/Pull 歷史翻閱。
 * 3. Save 自動儲存。
 * 4. Commit 上傳到後端 (使用 WT 專屬端點)。
 * 依賴：walkie-typie-db.js, walkie-typie-service.js
 * =================================================================
 */

import { WTDb } from "./walkie-typie-db.js";
import { WalkieTypieService } from "./services/walkie-typie-service.js";
import db from "./indexedDB.js";

export const WTVCS = {
    /**
     * 執行推播 (向上翻頁或回到前端)
     * @param {boolean} readOnly 若為 true，不進入虛擬新頁面 (THEY 側使用)
     */
    async push(state, currentText, readOnly = false) {
        if (state.isVirtual) {
            return false;
        }

        if (!readOnly) {
            await this.save(state, currentText);
        }

        await WTDb.scrubBranch(state.owner, state.branchId, state.maxSlot);

        // 在歷史頁面中往回跳一頁 (回到較新紀錄)
        if (state.currentHead > 0) {
            state.currentHead--;
            return true;
        }

        // Head 0 且非唯讀 → 進入虛擬新頁面模式
        if (!readOnly) {
            state.isVirtual = true;
            return true;
        }

        return false;
    },

    /**
     * 執行拉回 (向後翻閱歷史)
     * @param {boolean} readOnly 若為 true，不嘗試存檔 (THEY 側使用)
     */
    async pull(state, currentText, readOnly = false) {
        if (state.isVirtual) {
            state.isVirtual = false;
            if (!readOnly && currentText && currentText.trim()) {
                await this.save(state, currentText);
            } else {
                return true;
            }
        }

        if (!readOnly) {
            await this.save(state, currentText);
        }

        await WTDb.scrubBranch(state.owner, state.branchId, state.maxSlot);

        const count = await WTDb.countRecords(state.owner, state.branchId);

        if (state.currentHead < count - 1) {
            state.currentHead++;
            return true;
        }

        return false;
    },

    /**
     * 自動儲存
     */
    async save(state, text) {
        if (state.isVirtual) {
            if (text && text.trim()) {
                await WTDb.addRecord(state.owner, state.branchId, state.branch, text);
                state.isVirtual = false;
                state.currentHead = 0;
                await WTDb.cleanupOldRecords(state.owner, state.branchId, state.maxSlot);
            }
            return;
        }

        const entry = await WTDb.getRecord(state.owner, state.branchId, state.currentHead);

        if (entry) {
            if (entry.text !== text) {
                if (state.currentHead > 0) {
                    const head0 = await WTDb.getRecord(state.owner, state.branchId, 0);
                    if (head0 && (!head0.text || head0.text.trim() === "")) {
                        await db.walkieTypie.delete([head0.owner, head0.branchId, head0.timestamp]);
                    }
                }

                await WTDb.updateText(state.owner, state.branchId, entry.timestamp, text);
                state.currentHead = 0;
            }
        } else if (state.currentHead === 0) {
            if (text && text.trim()) {
                await WTDb.addRecord("local", state.branchId, state.branch, text);
            }
        }
    },

    /**
     * Commit: 上傳分支紀錄到 WT 專屬後端端點
     */
    async commit(branchMeta) {
        const { branchId, branch } = branchMeta;

        const loggedInUser = localStorage.getItem("currentUser");
        if (!loggedInUser) throw new Error("LOGIN REQUIRED FOR COMMIT.");

        const maxSlot = parseInt(localStorage.getItem("blackboard_max_slot")) || 10;
        await WTDb.scrubBranch("local", branchId, maxSlot);

        let records = await WTDb.getAllRecordsForBranch("local", branchId);
        records = records.filter(r => r.text && r.text.trim() !== "");

        if (records.length === 0) {
            throw new Error("LOCAL DATA NOT FOUND OR EMPTY.");
        }

        try {
            await WalkieTypieService.commitBoard({
                branchId: branchId,
                branchName: branch,
                records: records
            });

            const syncedOwner = `local, online/${loggedInUser} [synced]`;
            await db.walkieTypie.where('owner').equals('local')
                .and(item => item.branchId === branchId)
                .modify({ owner: syncedOwner });

            return true;
        } catch (e) {
            throw new Error(e.message || "UPLOAD FAILED.");
        }
    }
};
