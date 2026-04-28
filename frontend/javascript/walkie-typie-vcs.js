/**
 * Walkie-Typie VCS - Version Control Logic
 * =================================================================
 * 介紹：Walkie-Typie 專用的版本控制邏輯層。
 * 依賴：walkie-typie-db.js, walkie-typie-service.js
 * =================================================================
 */

import { WTDb } from "./walkie-typie-db.js";
import { WalkieTypieService } from "./services/walkie-typie-service.js";
import { FileService } from "./services/file-service.js";
import { BBMessage } from "./blackboard-msg.js";
import { extractHashes } from "./blackboard-core.js";
import db from "./indexedDB.js";
import { t } from './i18n.js';
import { BOARD_MAX_SLOT } from './settings.js';

export const WTVCS = {
    async push(state, currentText, readOnly = false) {
        if (state.isVirtual) return false;

        if (!readOnly) {
            await this.save(state, currentText);
        }

        const entryBefore = await WTDb.getRecord(state.branchId, state.currentHead);
        await WTDb.cleanupOldRecords(state.branchId, BOARD_MAX_SLOT);

        const count = await WTDb.countRecords(state.branchId);
        if (count === 0) {
            state.currentHead = 0;
            state.isVirtual = true;
            return true;
        }
        if (state.currentHead >= count) {
            state.currentHead = count - 1;
            return true;
        }
        const entryAfter = await WTDb.getRecord(state.branchId, state.currentHead);
        if (!entryBefore || !entryAfter || entryBefore.timestamp !== entryAfter.timestamp) {
            return true;
        }

        if (state.currentHead > 0) {
            state.currentHead--;
            return true;
        }

        if (!readOnly) {
            state.isVirtual = true;
            return true;
        }

        return false;
    },

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

        const entryBefore = await WTDb.getRecord(state.branchId, state.currentHead);
        await WTDb.cleanupOldRecords(state.branchId, BOARD_MAX_SLOT);

        const count = await WTDb.countRecords(state.branchId);

        // Post-scrub revalidation (three defenses from BB).
        if (count === 0) {
            state.currentHead = 0;
            state.isVirtual = true;
            return true;
        }
        if (state.currentHead >= count) {
            state.currentHead = count - 1;
            return true;
        }
        const entryAfter = await WTDb.getRecord(state.branchId, state.currentHead);
        if (!entryBefore || !entryAfter || entryBefore.timestamp !== entryAfter.timestamp) {
            return true;
        }

        if (state.currentHead < count - 1) {
            state.currentHead++;
            return true;
        }

        return false;
    },

    async save(state, text) {
        if (state.isVirtual) {
            if (text && text.trim()) {
                await WTDb.addRecord(state.branchId, state.branch, text);
                state.isVirtual = false;
                state.currentHead = 0;
                await WTDb.cleanupOldRecords(state.branchId, BOARD_MAX_SLOT);
            }
            return;
        }

        const entry = await WTDb.getRecord(state.branchId, state.currentHead);

        if (entry) {
            // Tier 18: always in-place edit (no rebase).
            if (entry.text !== text) {
                await WTDb.updateTextInPlace(state.branchId, entry.timestamp, text);
            }
        } else if (state.currentHead === 0) {
            if (text && text.trim()) {
                await WTDb.addRecord(state.branchId, state.branch, text);
            }
        }
    },

    async commit(branchMeta) {
        const { branchId, branch } = branchMeta;

        const loggedInUser = localStorage.getItem("currentUser");
        if (!loggedInUser) throw new Error(t('walkieTypie.loginRequired'));

        await WTDb.cleanupOldRecords(branchId, BOARD_MAX_SLOT);

        let records = await WTDb.getAllRecordsForBranch(branchId);
        records = records.filter(r => (r.text && r.text.trim() !== "") || r.file_hash);

        if (records.length === 0) {
            throw new Error(t('walkieTypie.noLocalData'));
        }

        const apiRecords = [];

        // Multi-file: extract every hash per record (file_hash may be a
        // single object, single string, or an array of either). Upload
        // each blob; serialise to a single string OR JSON array string
        // for the server payload — matches BB's commit shape so the
        // backend doesn't need to branch on board type.
        for (const r of records) {
            const hashes = extractHashes(r.file_hash);

            for (const hash of hashes) {
                const localFile = await db.file_blobs.get(hash);
                if (!localFile || !localFile.blob) {
                    console.warn(`WT Commit: Local file missing for hash ${hash}`);
                    continue;
                }
                if (localFile.status === 'synced') continue;
                const fileName = localFile.name || hash.substring(0, 8);
                const toast = BBMessage.loading(t('walkieTypie.uploading', { name: fileName }));
                try {
                    await FileService.upload(localFile.blob, localFile.name);
                    await db.file_blobs.update(hash, { status: 'synced' });
                    toast.update(t('walkieTypie.uploaded', { name: fileName }));
                } catch (e) {
                    console.error(`WT Commit: Upload failed for ${hash}`, e);
                    toast.close();
                    BBMessage.error(t('walkieTypie.uploadFailed', { name: fileName }));
                }
            }

            let fh = null;
            if (hashes.length === 1) fh = hashes[0];
            else if (hashes.length > 1) fh = JSON.stringify(hashes);
            apiRecords.push({
                ...r,
                file_hash: fh
            });
        }

        await WalkieTypieService.commitBoard({
            branch_id: branchId,
            branch_name: branch,
            records: apiRecords
        });

        return true;
    }
};
