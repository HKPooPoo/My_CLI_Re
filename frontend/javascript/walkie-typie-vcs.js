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
import db from "./indexedDB.js";
import { t } from './i18n.js';
import * as Settings from './settings.js';

export const WTVCS = {
    async push(state, currentText, readOnly = false) {
        if (state.isVirtual) return false;

        if (!readOnly) {
            await this.save(state, currentText);
        }

        if (Settings.get('wt', 'autoCleanBlanks')) {
            await WTDb.scrubBranch(state.branchId, state.maxSlot);
        } else {
            await WTDb.cleanupOldRecords(state.branchId, state.maxSlot);
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

        if (Settings.get('wt', 'autoCleanBlanks')) {
            await WTDb.scrubBranch(state.branchId, state.maxSlot);
        } else {
            await WTDb.cleanupOldRecords(state.branchId, state.maxSlot);
        }

        const count = await WTDb.countRecords(state.branchId);

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
                await WTDb.cleanupOldRecords(state.branchId, state.maxSlot);
            }
            return;
        }

        const entry = await WTDb.getRecord(state.branchId, state.currentHead);

        if (entry) {
            if (entry.text !== text) {
                if (Settings.get('wt', 'updateTimestamp')) {
                    if (state.currentHead > 0) {
                        const head0 = await WTDb.getRecord(state.branchId, 0);
                        if (head0 && (!head0.text || head0.text.trim() === "") && !head0.file_hash) {
                            await db.walkie_typie.delete([head0.branch_id, head0.timestamp]);
                        }
                    }
                    await WTDb.updateText(state.branchId, entry.timestamp, text);
                    state.currentHead = 0;
                } else {
                    await WTDb.updateTextInPlace(state.branchId, entry.timestamp, text);
                }
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

        const wtMaxSlot = Settings.get('wt', 'maxSlot');
        if (Settings.get('wt', 'autoCleanBlanks')) {
            await WTDb.scrubBranch(branchId, wtMaxSlot);
        } else {
            await WTDb.cleanupOldRecords(branchId, wtMaxSlot);
        }

        let records = await WTDb.getAllRecordsForBranch(branchId);
        records = records.filter(r => (r.text && r.text.trim() !== "") || r.file_hash);

        if (records.length === 0) {
            throw new Error(t('walkieTypie.noLocalData'));
        }

        const apiRecords = [];

        // Local First: never strip the hash. Failed uploads stay 'local' in
        // file_blobs; next commit retries automatically.
        for (const r of records) {
            let hashStr = null;

            if (r.file_hash) {
                const hash = r.file_hash.hash;
                const fileName = r.file_hash.name || hash.substring(0, 8);
                hashStr = hash;

                const localFile = await db.file_blobs.get(hash);
                if (localFile && localFile.blob) {
                    if (localFile.status !== 'synced') {
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
                } else {
                    console.warn(`WT Commit: Local file missing for hash ${hash}`);
                }
            }

            apiRecords.push({
                ...r,
                file_hash: hashStr
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
