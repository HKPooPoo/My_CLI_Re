import { BBCore } from "./blackboard-core.js";
import { BBMessage } from "./blackboard-msg.js";
import db from "./indexedDB.js";
import { BlackboardService } from "./services/blackboard-service.js";
import { FileService } from "./services/file-service.js";
import { t } from './i18n.js';

/**
 * Blackboard 版本控制邏輯層 (大腦)
 */
export const BBVCS = {
    /**
     * 執行推播 (向上翻頁或回到前端)
     */
    async push(state, currentText) {
        if (state.isVirtual) {
            return false;
        }

        await this.save(state, currentText);
        await BBCore.scrubBranch(state.owner, state.branchId, state.maxSlot);

        if (state.currentHead > 0) {
            state.currentHead--;
            return true;
        }

        state.isVirtual = true;
        return true;
    },

    /**
     * 執行拉回 (向後翻閱歷史)
     */
    async pull(state, currentText) {
        if (state.isVirtual) {
            state.isVirtual = false;
            if (currentText && currentText.trim()) {
                await this.save(state, currentText);
            } else {
                return true;
            }
        }

        await this.save(state, currentText);
        await BBCore.scrubBranch(state.owner, state.branchId, state.maxSlot);

        const count = await BBCore.countRecords(state.owner, state.branchId);

        if (state.currentHead < count - 1) {
            state.currentHead++;
            return true;
        }

        return false;
    },

    /**
     * 自動儲存：更新現有歷史點或新增初始點
     */
    async save(state, text) {
        if (state.isVirtual) {
            if (text && text.trim()) {
                await BBCore.addRecord(state.owner, state.branchId, state.branch, text);
                state.isVirtual = false;
                state.currentHead = 0;
                await BBCore.cleanupOldRecords(state.owner, state.branchId, state.maxSlot);
            }
            return;
        }

        const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);

        if (entry) {
            if (entry.text !== text) {
                if (state.currentHead > 0) {
                    const head0 = await BBCore.getRecord(state.owner, state.branchId, 0);
                    if (head0 && (!head0.text || head0.text.trim() === "") && !head0.file_hash) {
                        await db.blackboard.delete([head0.owner, head0.branch_id, head0.timestamp]);
                    }
                }

                await BBCore.updateText(state.owner, state.branchId, entry.timestamp, text);
                state.currentHead = 0;
            }
        } else if (state.currentHead === 0) {
            if (text && text.trim()) {
                await BBCore.addRecord("local", state.branchId, state.branch, text);
            }
        }
    },

    /**
     * Commit: 將指定分支的所有本地歷史上傳至 Server
     */
    async commit(branchMeta) {
        const { branchId, branch } = branchMeta;

        const loggedInUser = localStorage.getItem("currentUser");
        if (!loggedInUser) throw new Error(t('blackboard.loginRequired'));

        const maxSlot = parseInt(localStorage.getItem("blackboard_max_slot")) || 10;
        await BBCore.scrubBranch("local", branchId, maxSlot);

        let records = await BBCore.getAllRecordsForBranch("local", branchId);
        records = records.filter(r => (r.text && r.text.trim() !== "") || r.file_hash);

        if (records.length === 0) {
            throw new Error(t('blackboard.noData'));
        }

        // [File Sync]: Upload pending files first
        const fileUploadPromises = records
            .filter(r => r.file_hash)
            .map(async (r) => {
                const hash = (r.file_hash && typeof r.file_hash === 'object') ? r.file_hash.hash : r.file_hash;
                try {
                    const exists = await FileService.exists(hash);
                    if (exists) return;

                    const fileData = await db.file_blobs.get(hash);
                    if (!fileData || !fileData.blob) {
                        console.warn(`Local file missing for hash ${hash}, skipping upload.`);
                        return;
                    }

                    await FileService.upload(fileData.blob);
                    await db.file_blobs.update(hash, { status: 'synced' });
                } catch (err) {
                    console.error(`Failed to sync file ${hash}:`, err);
                    throw new Error(t('blackboard.fileSyncFailed'));
                }
            });

        if (fileUploadPromises.length > 0) {
            BBMessage.info(t('blackboard.syncingFiles'));
            await Promise.all(fileUploadPromises);
        }

        try {
            const payloadRecords = records.map(r => ({
                ...r,
                file_hash: (r.file_hash && typeof r.file_hash === 'object') ? r.file_hash.hash : r.file_hash
            }));

            await BlackboardService.commit({
                branch_id: branchId,
                branch_name: branch,
                records: payloadRecords
            });

            const syncedOwner = `local, online/${loggedInUser} [synced]`;
            await db.blackboard.where('owner').equals('local')
                .and(item => item.branch_id === branchId)
                .modify({ owner: syncedOwner });

            return true;
        } catch (e) {
            throw new Error(e.message || t('blackboard.uploadFailed'));
        }
    },

    /**
     * Checkout: 切換分支
     */
    async checkout(state, targetBranchId, targetOwner) {
        if (targetOwner !== "local") {
            BBMessage.info(t('blackboard.syncing'));

            try {
                const data = await BlackboardService.fetchBranchDetails(targetBranchId);

                const currentUser = localStorage.getItem("currentUser") || "unknown";

                const downloadRecords = data.records.map(r => {
                    let binData = r.file_hash;
                    if (r.file_hash && r.file_name) {
                        binData = {
                            hash: r.file_hash,
                            name: r.file_name,
                            size: r.file_size,
                            mime: r.file_mime
                        };
                    }

                    return {
                        owner: `local, online/${r.uid} [synced]`,
                        branch_id: parseInt(r.branch_id),
                        branch: r.branch_name,
                        timestamp: parseInt(r.timestamp),
                        text: r.text,
                        file_hash: binData
                    };
                });

                await db.blackboard.bulkPut(downloadRecords);
                await BBCore.scrubBranch("local", targetBranchId, state.maxSlot || 10);
            } catch (e) {
                console.warn("CLOUD SYNC FAILED. USING LOCAL CACHE.", e);
            }
        }

        state.branchId = targetBranchId;
        state.owner = "local";
        state.currentHead = 0;

        const latest = await BBCore.getRecord("local", targetBranchId, 0);
        state.branch = latest?.branch ?? "";

        localStorage.setItem("currentBranchId", state.branchId);
        return true;
    }
};
