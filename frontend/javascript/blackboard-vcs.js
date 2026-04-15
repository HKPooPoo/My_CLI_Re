import { BBCore, extractHashes, makeSyncedOwner, makeAsyncedOwner } from "./blackboard-core.js";
import { BBMessage } from "./blackboard-msg.js";
import db, { Dexie } from "./indexedDB.js";
import { BlackboardService } from "./services/blackboard-service.js";
import { FileService } from "./services/file-service.js";
import { t } from './i18n.js';
import * as Settings from './settings.js';

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

        const entryBefore = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        if (Settings.get('bb', 'autoCleanBlanks')) {
            await BBCore.scrubBranch(state.owner, state.branchId, state.maxSlot);
        } else {
            await BBCore.cleanupOldRecords(state.owner, state.branchId, state.maxSlot);
        }

        // [Fix]: Revalidate head after cleanup — scrub may have removed the current record,
        // shifting a different record into this position. Detect and force UI refresh.
        const count = await BBCore.countRecords(state.owner, state.branchId);
        if (count === 0) { state.currentHead = 0; state.isVirtual = true; return true; }
        if (state.currentHead >= count) { state.currentHead = count - 1; return true; }
        const entryAfter = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        if (!entryBefore || !entryAfter || entryBefore.timestamp !== entryAfter.timestamp) {
            return true;
        }

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
                // [Fix]: Check if records exist before exiting virtual.
                // Without this, empty branches oscillate: virtual → stuck head 0 → virtual.
                const count = await BBCore.countRecords(state.owner, state.branchId);
                if (count === 0) {
                    state.isVirtual = true;
                    return false;
                }
                return true;
            }
        }

        await this.save(state, currentText);

        const entryBefore = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        if (Settings.get('bb', 'autoCleanBlanks')) {
            await BBCore.scrubBranch(state.owner, state.branchId, state.maxSlot);
        } else {
            await BBCore.cleanupOldRecords(state.owner, state.branchId, state.maxSlot);
        }

        const count = await BBCore.countRecords(state.owner, state.branchId);

        // [Fix]: Revalidate head after cleanup — scrub may have removed the current record,
        // shifting a different record into this position. Detect and force UI refresh.
        if (count === 0) { state.currentHead = 0; state.isVirtual = true; return true; }
        if (state.currentHead >= count) { state.currentHead = count - 1; return true; }
        const entryAfter = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        if (!entryBefore || !entryAfter || entryBefore.timestamp !== entryAfter.timestamp) {
            return true;
        }

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
                if (Settings.get('bb', 'updateTimestamp')) {
                    if (state.currentHead > 0) {
                        const head0 = await BBCore.getRecord(state.owner, state.branchId, 0);
                        if (head0 && (!head0.text || head0.text.trim() === "") && !head0.file_hash) {
                            await db.blackboard.delete([head0.owner, head0.branch_id, head0.timestamp]);
                        }
                    }
                    await BBCore.updateText(state.owner, state.branchId, entry.timestamp, text);
                    state.currentHead = 0;
                } else {
                    await BBCore.updateTextInPlace(state.owner, state.branchId, entry.timestamp, text);
                }
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
    async commit(branchMeta, deviceId = null) {
        const { branchId, branch } = branchMeta;

        const loggedInUser = localStorage.getItem("currentUser");
        if (!loggedInUser) throw new Error(t('blackboard.loginRequired'));

        const maxSlot = Settings.get('bb', 'maxSlot');
        if (Settings.get('bb', 'autoCleanBlanks')) {
            await BBCore.scrubBranch("local", branchId, maxSlot);
        } else {
            await BBCore.cleanupOldRecords("local", branchId, maxSlot);
        }

        let records = await BBCore.getAllRecordsForBranch("local", branchId);
        records = records.filter(r => (r.text && r.text.trim() !== "") || r.file_hash);

        if (records.length === 0) {
            throw new Error(t('blackboard.noData'));
        }

        // [File Sync]: Upload pending files sequentially to avoid 429 rate-limit.
        // Deduplicate hashes first — same file may appear in multiple records.
        const uniqueHashes = new Set();
        for (const r of records) {
            for (const hash of extractHashes(r.file_hash)) {
                uniqueHashes.add(hash);
            }
        }

        // Local First: attempt uploads but never strip the hash from payload.
        // Failed uploads stay as 'local' status in file_blobs; next commit retries.
        // Server may receive a hash that does not yet exist on disk — observers
        // will see the chip and get downloadFailed until the retry succeeds.
        // Note: per-file failure toast is deferred until AFTER the records POST
        // succeeds — otherwise an offline scenario shows a misleading "X files
        // failed, retry later" alongside the caller's "sync failed" toast.
        let failedCount = 0;
        if (uniqueHashes.size > 0) {
            for (const hash of uniqueHashes) {
                try {
                    const exists = await FileService.exists(hash);
                    if (exists) continue;

                    const fileData = await db.file_blobs.get(hash);
                    if (!fileData || !fileData.blob) {
                        console.warn(`Local file missing for hash ${hash}, cannot upload.`);
                        failedCount++;
                        continue;
                    }

                    // Per-file progress toast so large uploads don't look frozen.
                    const fileName = fileData.name || hash.substring(0, 8);
                    BBMessage.info(t('blackboard.uploading', { name: fileName }));
                    await FileService.upload(fileData.blob);
                    await db.file_blobs.update(hash, { status: 'synced' });
                } catch (err) {
                    console.error(`Failed to sync file ${hash}:`, err);
                    failedCount++;
                }
            }
        }

        try {
            // Deduplicate records by timestamp — multiple owner variants
            // (e.g. "local" vs "local, online/uid [synced]") can produce
            // records with the same branch_id+timestamp in IndexedDB.
            const seen = new Set();
            const uniqueRecords = records.filter(r => {
                if (seen.has(r.timestamp)) return false;
                seen.add(r.timestamp);
                return true;
            });

            const payloadRecords = uniqueRecords.map(r => {
                const hashes = extractHashes(r.file_hash);
                let fh = null;
                if (hashes.length === 1) fh = hashes[0];
                else if (hashes.length > 1) fh = JSON.stringify(hashes);
                return { ...r, file_hash: fh };
            });

            const commitPayload = {
                branch_id: branchId,
                branch_name: branch,
                records: payloadRecords
            };
            if (deviceId) commitPayload.device_id = deviceId;

            await BlackboardService.commit(commitPayload);

            // POST succeeded — now safe to inform user about per-file failures.
            // (If POST had failed, this toast would contradict the caller's
            // sync-failed toast and confuse the user about what actually got out.)
            if (failedCount > 0) {
                BBMessage.error(t('blackboard.filesPartialFail', { count: failedCount }));
            }

            // Honest status display per design page 18:
            //   - All files uploaded → "local, online/uid [synced]"
            //   - Some files failed  → "local, online/uid [asynced]" (records on
            //     server but content not fully matching due to missing blobs)
            //   - Records POST itself failed (handled by outer catch) → stays "local"
            const targetOwner = failedCount === 0
                ? makeSyncedOwner(loggedInUser)
                : makeAsyncedOwner(loggedInUser);
            try {
                await db.blackboard.where('owner').startsWith('local')
                    .and(item => item.branch_id === branchId)
                    .modify({ owner: targetOwner });
            } catch (tagErr) {
                console.warn('[BBVCS] Server commit OK, but local sync-tag update failed:', tagErr);
                BBMessage.error(t('blackboard.tagUpdateFailed'));
            }

            return true;
        } catch (e) {
            throw new Error(e.message || t('blackboard.uploadFailed'));
        }
    },

    /**
     * Checkout: 切換分支
     */
    async checkout(state, targetBranchId, targetOwner) {
        let serverFetched = (targetOwner === "local");
        if (targetOwner !== "local") {

            try {
                const data = await BlackboardService.fetchBranchDetails(targetBranchId);

                const currentUser = localStorage.getItem("currentUser") || "unknown";

                const downloadRecords = data.records.map(r => {
                    let binData = r.file_hash;

                    // Try parsing as JSON array (multi-file)
                    const hashes = extractHashes(binData);
                    if (hashes.length > 1) {
                        binData = hashes.map(h => ({ hash: h }));
                    } else if (hashes.length === 1 && r.file_name) {
                        binData = {
                            hash: hashes[0],
                            name: r.file_name,
                            size: r.file_size,
                            mime: r.file_mime
                        };
                    } else if (hashes.length === 1) {
                        binData = hashes[0];
                    } else {
                        binData = null;
                    }

                    return {
                        owner: makeSyncedOwner(r.uid),
                        branch_id: parseInt(r.branch_id),
                        branch: r.branch_name,
                        timestamp: parseInt(r.timestamp),
                        text: r.text,
                        file_hash: binData
                    };
                });

                // [Guard]: Only replace local records if server actually has data.
                // Without this, remote checkout on a local-only branch (e.g. freshly
                // forked, never committed) nukes all local records because server
                // returns empty — triggered by BBSync.recover() on visibilitychange.
                if (downloadRecords.length > 0) {
                    // [Race-condition guard]: Preserve uncommitted local file hashes.
                    // visibilitychange:visible triggers recover()→checkout(), which races
                    // with handleFile()'s onAttach() writing file_hash to the same record.
                    // Blobs with status='local' are attached but not yet committed — don't wipe them.
                    const localFileMap = new Map(); // timestamp → file_hash
                    const localWithFiles = await db.blackboard.where('[branch_id+timestamp]')
                        .between([targetBranchId, Dexie.minKey], [targetBranchId, Dexie.maxKey])
                        .and(item => item.owner.startsWith('local') && !!item.file_hash)
                        .toArray();
                    for (const r of localWithFiles) {
                        for (const h of extractHashes(r.file_hash)) {
                            const blob = await db.file_blobs.get(h);
                            if (blob?.status === 'local') {
                                localFileMap.set(r.timestamp, r.file_hash);
                                break;
                            }
                        }
                    }

                    const oldKeys = await db.blackboard.where('[branch_id+timestamp]')
                        .between([targetBranchId, Dexie.minKey], [targetBranchId, Dexie.maxKey])
                        .and(item => item.owner.startsWith('local'))
                        .primaryKeys();
                    if (oldKeys.length > 0) {
                        await db.blackboard.bulkDelete(oldKeys);
                    }
                    await db.blackboard.bulkPut(downloadRecords);

                    // Restore uncommitted file hashes that the server doesn't have yet
                    if (localFileMap.size > 0) {
                        await db.blackboard.where('[branch_id+timestamp]')
                            .between([targetBranchId, Dexie.minKey], [targetBranchId, Dexie.maxKey])
                            .and(item => item.owner.startsWith('local') && localFileMap.has(item.timestamp) && !item.file_hash)
                            .modify(item => { item.file_hash = localFileMap.get(item.timestamp); });
                    }
                }
                if (Settings.get('bb', 'autoCleanBlanks')) {
                    await BBCore.scrubBranch("local", targetBranchId, state.maxSlot || 10);
                } else {
                    await BBCore.cleanupOldRecords("local", targetBranchId, state.maxSlot || 10);
                }
                serverFetched = true;
            } catch (e) {
                console.warn("CLOUD SYNC FAILED. USING LOCAL CACHE.", e);
                BBMessage.info(t('blackboard.usingLocalCache'));
            }
        }

        state.branchId = targetBranchId;
        state.owner = "local";
        state.currentHead = 0;

        const latest = await BBCore.getRecord("local", targetBranchId, 0);
        state.branch = latest?.branch ?? "";

        localStorage.setItem("currentBranchId", state.branchId);
        return serverFetched;
    }
};
