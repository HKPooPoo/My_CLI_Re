/**
 * Blackboard Main - Controller
 * =================================================================
 * 介紹：黑板系統的主入口與全域狀態控制器。
 * 職責：
 * 1. 管理黑板的運行狀態 (State)，包括當前分支、持有者、歷史指標 (Head) 等。
 * 2. 統籌初始化流程：檢測本地數據、恢復上次開啟的分支、更新 UI。
 * 3. 綁定所有交互按鈕 (PUSH, PULL, COMMIT, FORK, DROP) 的高級邏輯。
 * 4. 監聽全域事件 (改名、授權更新、清單刷新) 並做出反應。
 * 依賴：BBCore, BBVCS, BBUI, BBMessage, MultiStepButton, IndexedDB
 * =================================================================
 */

import { BBCore, getHKTTimestamp, extractHashes, markAsynced } from "./blackboard-core.js";
import { BBVCS } from "./blackboard-vcs.js";
import { BBUI } from "./blackboard-ui.js";
import { BBMessage } from "./blackboard-msg.js";
import { initAllInfiniteLists, listInstances } from "./blackboard-ui-list.js"
import db from "./indexedDB.js"
import { MultiStepButton } from "./multiStepButton.js";
import { BlackboardService } from "./services/blackboard-service.js";
import { EditorAttachments } from "./editor-attachments.js";
import { t } from './i18n.js';
import { T } from './timing.js';
import * as Settings from './settings.js';
import { BBSync } from './blackboard-sync.js';
import { TimerGroup } from './timer-group.js';
import * as CrossTabSync from './cross-tab-sync.js';
import { attachContentSearch } from './content-search.js';

// --- 全域狀態聲明 ---
const state = {
    owner: "local",      // 當前編輯權限 (通常設為 local)
    branch: "",         // 當前分支名稱 (用於 UI 顯示)
    branchId: 0,        // 當前分支物理 ID
    currentHead: 0,     // 歷史深度指標 (0 表示最新)
    isVirtual: false,   // 是否處於「新頁面」的虛擬狀態 (尚未存入 DB)
    currentFileHash: null,
};

const timers = new TimerGroup();
let isInitializing = false;

// Exported for feature modules (e.g. features/llm.js) that need to read
// the current branch/page context without a MOD-style API layer.
export { state as BBState };

// --- File Attachment Instance ---
const bbAttach = EditorAttachments.create({
    dropZoneSelector: '#log-textarea',
    fileInputSelector: '#bb-file-input',
    chipsContainerSelector: '#bb-attachment-chips',
    dropOverlaySelector: '#bb-drop-overlay',
    onAttach: async (hash, meta) => {
        const binData = { hash, ...meta };

        // Adding a blob the server hasn't received yet means the branch is no
        // longer byte-for-byte equal to its server copy. The RECORD's owner
        // tag is downgraded to [asynced] on existing records so observers
        // (other tabs, next updateBranchList() re-derivation) don't keep
        // seeing a [synced] branch that lies. Commit re-promotes to [synced]
        // once upload succeeds.
        //
        // State.owner, by contrast, stays at the literal "local" catch-all
        // at all times in local mode — see "state.owner must be the 'local'
        // literal" invariant in CLAUDE.md Branch-tag section. BBCore.getRecord
        // only hits the startsWith('local') branch when owner === 'local'
        // literally; any specific tag takes the exact-index path and misses
        // records with other tags in mixed-ownership branches.
        if (state.isVirtual) {
            // Redundant-signal approach: stamp the new record with
            // markAsynced(existing branch's owner tag) so dirty detection
            // has two independent signals — the bumped timestamp (via new
            // record's Date.now()) AND the [asynced] suffix that
            // hasAsyncedRecord picks up. If the branch has no existing
            // record (brand-new empty branch), fall back to the plain
            // "local" literal — there's no prior sync context to inherit.
            //
            // state.owner still drops to the "local" literal per the
            // Branch-tag invariant. This is the one deliberate case
            // where record.owner ≠ state.owner — the record carries
            // tag-level provenance for dirty detection, while state.owner
            // stays at the catch-all so navigation works across mixed-
            // ownership branches.
            let newOwner = "local";
            const anyRecord = await BBCore.getRecord("local", state.branchId, 0);
            if (anyRecord && anyRecord.owner) {
                newOwner = markAsynced(anyRecord.owner);
            }
            await BBCore.addRecord(
                newOwner,
                state.branchId,
                state.branch,
                BBUI.getTextareaValue() || "",
                binData
            );
            state.owner = "local";
            state.isVirtual = false;
            state.currentHead = 0;
            BBUI.updateIndicators(state.branch || t('blackboard.branchNameFallback'), state.currentHead, true);
            CrossTabSync.broadcast('bb:record:mutated', { branchId: state.branchId, timestamp: null });
        } else {
            const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
            if (entry) {
                // Multi-file: append to existing file_hash array
                const existing = entry.file_hash;
                let fileHashes;
                if (Array.isArray(existing)) {
                    fileHashes = [...existing, binData];
                } else if (existing) {
                    fileHashes = [existing, binData];
                } else {
                    fileHashes = [binData];
                }

                // Tier 18: updateTimestamp toggle removed — always
                // in-place. File mutation stamps the record [asynced]
                // (local-only divergence signal; other devices can't
                // detect the change without commit) but keeps the
                // timestamp, so head position is stable.
                const newOwner = markAsynced(entry.owner);
                if (newOwner !== entry.owner) {
                    await db.blackboard.where('[owner+branch_id+timestamp]')
                        .equals([entry.owner, entry.branch_id, entry.timestamp])
                        .modify({ file_hash: fileHashes, owner: newOwner });
                } else {
                    await db.blackboard.update([entry.owner, entry.branch_id, entry.timestamp], { file_hash: fileHashes });
                }

                // Defensive: keep state.owner at 'local' regardless of what
                // the record just became. Self-heals if another path drifted
                // state.owner to a specific tag.
                state.owner = "local";
                CrossTabSync.broadcast('bb:record:mutated', { branchId: entry.branch_id, timestamp: entry.timestamp });
            } else if (state.currentHead === 0) {
                await BBCore.addRecord("local", state.branchId, state.branch, BBUI.getTextareaValue() || "", [binData]);
                state.owner = "local";
                state.currentHead = 0;
                CrossTabSync.broadcast('bb:record:mutated', { branchId: state.branchId, timestamp: null });
            }
        }
        BBSync.scheduleAutoCommit();
    },
    onDetach: async (hash) => {
        const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        if (!entry) return;

        // Same asynced-on-divergence rule as onAttach: removing a file from a
        // [synced] record means the branch diverges from the server copy
        // until commit re-uploads the modified record.
        const existing = entry.file_hash;
        let updated;
        if (Array.isArray(existing)) {
            const filtered = existing.filter(f => {
                const h = (typeof f === 'object') ? f.hash : f;
                return h !== hash;
            });
            updated = filtered.length > 0 ? filtered : null;
        } else {
            const currentHash = (typeof existing === 'object') ? existing?.hash : existing;
            if (currentHash !== hash) return;
            updated = null;
        }

        // Tier 18: always in-place detach.
        const newOwner = markAsynced(entry.owner);
        if (newOwner !== entry.owner) {
            await db.blackboard.where('[owner+branch_id+timestamp]')
                .equals([entry.owner, entry.branch_id, entry.timestamp])
                .modify({ file_hash: updated, owner: newOwner });
        } else {
            await db.blackboard.update([entry.owner, entry.branch_id, entry.timestamp], { file_hash: updated });
        }
        state.owner = "local";
        BBSync.scheduleAutoCommit();
        CrossTabSync.broadcast('bb:record:mutated', { branchId: entry.branch_id, timestamp: entry.timestamp });
    },
    onRename: async (oldHash, newHash, meta) => {
        const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        if (!entry) return;

        const binData = { hash: newHash, ...meta };
        const swap = (item) => {
            const h = (typeof item === 'object') ? item?.hash : item;
            return h === oldHash ? binData : item;
        };

        const existing = entry.file_hash;
        const updated = Array.isArray(existing) ? existing.map(swap) : swap(existing);

        // Tier 18: always in-place rename. `markAsynced` flags the record
        // so `hasAsyncedRecord` dirty detection still picks it up.
        const newOwner = markAsynced(entry.owner);
        if (newOwner !== entry.owner) {
            await db.blackboard.where('[owner+branch_id+timestamp]')
                .equals([entry.owner, entry.branch_id, entry.timestamp])
                .modify({ file_hash: updated, owner: newOwner });
        } else {
            await db.blackboard.update([entry.owner, entry.branch_id, entry.timestamp], { file_hash: updated });
        }
        state.owner = "local";

        BBSync.scheduleAutoCommit();
        CrossTabSync.broadcast('bb:record:mutated', {
            branchId: entry.branch_id,
            timestamp: entry.timestamp
        });
    },
});

/**
 * 系統初始化
 * 步驟：1. 讀取登入狀態 2. 檢查資料庫是否為空 3. 若為空則初始化 master 4. 若不為空則恢復上次分支 5. 同步畫面
 */
export async function initBoard() {
    if (isInitializing) return;
    isInitializing = true;

    try {
        state.owner = "local"; // 進入點強制設為本地可編輯模式

        const totalCount = await db.blackboard.count();

        if (totalCount === 0) {
            // 首次啟動：建立 master
            const newId = Date.now();
            await BBCore.addRecord("local", newId, "master");
            state.branchId = newId;
            state.branch = "master";
        } else {
            // 讀取現有分支
            let branches = await BBCore.getAllBranches("local");
            if (branches.length > 0) {
                const lastBranchId = parseInt(localStorage.getItem("currentBranchId"));
                const activeBranch = branches.find(b => b.id === lastBranchId) || branches[0];
                state.branchId = activeBranch.id;
                state.branch = activeBranch.name;
            }
        }

        localStorage.setItem("currentBranchId", state.branchId);
        state.currentHead = 0;

        await syncView();
        await updateBranchList();
    } catch (e) {
        console.error("Blackboard Init Failed:", e);
        BBMessage.error(t('blackboard.initFailed'));
    } finally {
        isInitializing = false;
    }
}

/**
 * 同步畫面內容
 * 步驟：1. 從 Core 抓取當前 Head 對應的紀錄 2. 更新文字框 3. 更新 UI 指標
 */
async function syncView() {
    // [Fix]: 虛擬狀態處理 (New Page)
    if (state.isVirtual) {
        BBUI.setTextarea("");
        BBUI.updateIndicators(state.branch || t('blackboard.branchNameFallback'), "NEW", false);
        bbAttach?.clear();
        state.currentFileHash = null;
        await renderPreviewRail();
        return;
    }

    const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
    const before = BBUI.elements.textarea?.value ?? '';
    const after = entry?.text ?? '';
    const isFocused = document.activeElement === BBUI.elements.textarea;
    if (before !== after) {
        const b = before.slice(0, 30) + (before.length > 30 ? '…' : '');
        const a = after.slice(0, 30) + (after.length > 30 ? '…' : '');
        const level = isFocused ? 'warn' : 'log';
        console[level](`[AUTO-SYNC] syncView OVERWRITE textarea: "${b}" → "${a}"${isFocused ? ' (user is typing!)' : ''}`);
    }
    BBUI.setTextarea(after);
    BBUI.updateIndicators(state.branch || t('blackboard.branchNameFallback'), state.currentHead, true);

    // Sync attachment chip display (multi-file aware)
    const binData = entry?.file_hash;
    state.currentFileHash = binData ?? null;
    const hashes = extractHashes(binData);
    bbAttach?.setFromRecord(hashes.length > 0 ? hashes : null);

    await renderPreviewRail();
}

// --- Page Previewer rail (Tier 11 part 2) -------------------------------
//
// Vertical column beside the textarea with one block per record in the
// current branch, newest at the top. Populated after every syncView so it
// tracks navigation / save / cross-tab mutations without a separate
// trigger system.
//
// _previewRailCache is the records snapshot backing the hover lookup.
// _hoverSnapshot stores the textarea value before the cursor entered a
// preview block; mouseleave restores it so the peek is non-destructive.
let _previewRailCache = [];
let _hoverSnapshot = null;

async function renderPreviewRail() {
    const rail = document.getElementById('bb-preview-rail');
    if (!rail) return;

    const records = await BBCore.getAllRecordsForBranch(state.owner, state.branchId);
    records.sort((a, b) => b.timestamp - a.timestamp);
    _previewRailCache = records;

    const frag = document.createDocumentFragment();

    if (state.isVirtual) {
        const vBlock = document.createElement('div');
        vBlock.className = 'page-preview-block virtual active';
        vBlock.dataset.head = '-1';
        frag.appendChild(vBlock);
    }

    records.forEach((rec, idx) => {
        const block = document.createElement('div');
        let cls = 'page-preview-block';
        if (!state.isVirtual && idx === state.currentHead) cls += ' active';
        const ownerStr = rec.owner || '';
        if (ownerStr === 'local' || ownerStr.includes('[asynced]')) cls += ' unsynced';
        block.className = cls;
        block.dataset.head = String(idx);
        block.draggable = true;  // Tier 22: enable HTML5 drag-and-drop reorder
        frag.appendChild(block);
    });

    // Replace ONLY the preview blocks — keep the docked `.editor-search`
    // at the bottom of the rail alive across renders. Using
    // `replaceChildren(frag)` wiped the search UI with every syncView.
    rail.querySelectorAll('.page-preview-block').forEach(b => b.remove());
    const search = rail.querySelector('.editor-search');
    if (search) rail.insertBefore(frag, search);
    else rail.appendChild(frag);

    // If the search pill is open, the record set may have changed
    // (commit, cross-tab mutation, push/pull). Re-run match count so
    // `N/M` stays honest. No-op when collapsed.
    bbSearch?.refresh();
}

/**
 * 刷新分支清單 (Local + Remote 混合)
 * 步驟：1. 抓取本地分支 2. 抓取遠端分支 3. 透過 Map 進行 ID 合併 4. 判斷 IsDirty 狀態 5. 排序並渲染
 */
let _listBusy = false;
// Signature of the last render: skip the DOM rebuild when a poll/broadcast
// produces data identical to what's already on screen. Keeps DevTools
// inspection, hover, and text selection stable across the 2s poll cycle.
let _lastRenderedBranchesSig = null;
async function updateBranchList() {
    if (_listBusy) return;
    _listBusy = true;
    try {
        const localBranches = await BBCore.getAllBranches("local");
        const loggedInUser = localStorage.getItem("currentUser");
        const branchMap = new Map();

        // 處理本地數據
        if (localBranches && Array.isArray(localBranches)) {
            localBranches.forEach(b => {
                branchMap.set(b.id, {
                    id: b.id,
                    name: b.name,
                    owner: "local",
                    lastUpdate: Number(b.lastUpdate),
                    displayTime: getHKTTimestamp(b.id),
                    isLocal: true,
                    isServer: false,
                    isDirty: false,
                    serverOwner: "",
                    hasAsyncedRecord: !!b.hasAsyncedRecord
                });
            });
        }

        // 處理雲端數據 (若已登入)
        if (loggedInUser) {
            try {
                const data = await BlackboardService.fetchBranches();

                if (data && Array.isArray(data.branches)) {
                    data.branches.forEach(sb => {
                        const sid = parseInt(sb.branch_id);
                        const serverLastUpdate = Number(sb.last_update);
                        const existing = branchMap.get(sid);

                        if (existing) {
                            existing.isServer = true;
                            existing.serverOwner = sb.uid;
                            existing.serverLastUpdate = serverLastUpdate;
                            // Dirty if either timestamps disagree OR any local
                            // record in this branch already carries an
                            // [asynced] owner tag (attach/detach/rename flip
                            // the owner without changing the timestamp, so the
                            // timestamp check alone misses that divergence).
                            existing.isDirty = (serverLastUpdate !== existing.lastUpdate)
                                || existing.hasAsyncedRecord;
                        } else {
                            branchMap.set(sid, {
                                id: sid,
                                name: sb.branch_name,
                                owner: "local",
                                lastUpdate: serverLastUpdate,
                                displayTime: getHKTTimestamp(sid),
                                isLocal: false,
                                isServer: true,
                                isDirty: true,
                                serverOwner: sb.uid
                            });
                        }
                    });
                }
            } catch (e) {
                console.error("FAILED TO LOAD CLOUD BRANCHES", e);
            }
        }

        // [Focus Protection]: Re-check JUST before render, not at function start.
        // The async fetches above can take 100ms+; user may start typing in a
        // branch name input during that window. Old check at top was too early.
        const isTyping = document.activeElement && document.activeElement.classList.contains('vcs-list-branch');
        if (isTyping) return;

        const combinedBranches = Array.from(branchMap.values());

        // Stable sort: by lastUpdate desc, then branchId desc as tiebreaker.
        // Without tiebreaker, branches with identical timestamps (e.g. after fork)
        // swap positions between renders, causing visual instability.
        combinedBranches.sort((a, b) => {
            return (b.lastUpdate - a.lastUpdate) || (b.id - a.id);
        });

        // [Fix]: 嘗試保留當前選中的分支，若無 (首次加載) 則可考慮預設為當前分支
        const currentSelection = getSelectedBranchInfo();
        const targetSelectionId = currentSelection ? currentSelection.id : state.branchId;

        // Skip the DOM rewrite when this render would produce the same output
        // as the last one. Without this, the 2s background poll (and every
        // cross-tab broadcast) rebuilds the full list and wipes DevTools
        // selection, hover, and in-flight UI state. Signature covers the
        // render inputs: per-branch identity + the three state params.
        const signature = JSON.stringify({
            b: combinedBranches.map(b => [b.id, b.name, b.owner, b.lastUpdate, b.isLocal, b.isServer, b.isDirty, b.serverOwner]),
            s: [state.branchId, state.owner, targetSelectionId]
        });
        if (signature !== _lastRenderedBranchesSig) {
            _lastRenderedBranchesSig = signature;
            BBUI.renderBranchList(combinedBranches, targetSelectionId, state.owner, state.branchId);
        }

        // Return whether server has newer data for the current branch (for poll fallback)
        const currentBranch = branchMap.get(state.branchId);
        if (currentBranch?.isLocal && currentBranch?.isServer) {
            return { serverNewer: currentBranch.serverLastUpdate > currentBranch.lastUpdate };
        }
    } catch (criticalError) {
        console.error("CRITICAL: Failed to update branch list", criticalError);
        BBMessage.error(t('blackboard.listFailed'));
    } finally {
        _listBusy = false;
    }
}

/**
 * 獲取當前清單中選中的分支資訊
 */
function getSelectedBranchInfo() {
    const activeItem = document.querySelector(".vcs-list-item.active");
    if (!activeItem) return null;

    return {
        id: parseInt(activeItem.dataset.branchId),
        name: activeItem.dataset.branchName,
        isLocal: activeItem.dataset.isLocal === "true",
        isServer: activeItem.dataset.isServer === "true",
        isDirty: activeItem.dataset.isDirty === "true"
    };
}

// --- 按鈕組件初始化 ---

// PUSH / PULL (操作對象：編輯中分支)
// [Guard]: Only act when a blackboard page is active. Prevents interference with BC's shared buttons.
function isBlackboardPageActive() {
    const p = document.querySelector('.page.active');
    return p && p.dataset.page && p.dataset.page.startsWith('blackboard-');
}

if (BBUI.elements.pushBtn) {
    new MultiStepButton(BBUI.elements.pushBtn, {
        sound: "Click.mp3",
        action: async () => {
            if (!isBlackboardPageActive()) return;
            const updated = await BBVCS.push(state, BBUI.getTextareaValue());
            if (updated) {
                await syncView();
                // [Optimization]: 移除 updateBranchList 以消除網絡延遲
            }
        }
    });
}

// DELETE PAGE — destructive 3-step. Removes the record at currentHead.
// Virtual state (new blank page) has no backing record → no-op. Empty
// branch after delete → virtual state restored.
const $bbDeleteBtn = document.getElementById('bb-delete-page-btn');
if ($bbDeleteBtn) {
    new MultiStepButton($bbDeleteBtn, {
        sound: "Click.mp3",
        steps: 1,
        action: async () => {
            if (!isBlackboardPageActive()) return;
            if (state.isVirtual) {
                BBMessage.info(t('blackboard.deletePageFailed'));
                return;
            }
            try {
                const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
                if (!entry) return;
                await db.blackboard.delete([entry.owner, entry.branch_id, entry.timestamp]);
                const count = await BBCore.countRecords(state.owner, state.branchId);
                if (count === 0) {
                    state.isVirtual = true;
                    state.currentHead = 0;
                } else if (state.currentHead >= count) {
                    state.currentHead = count - 1;
                }
                state.owner = "local";
                await syncView();
                await updateBranchList();
                BBSync.scheduleAutoCommit();
                CrossTabSync.broadcast('bb:record:mutated', { branchId: state.branchId, timestamp: null });
                BBMessage.info(t('common.pageDeleted'));
            } catch (err) {
                console.error('BB delete page failed:', err);
                BBMessage.error(t('common.deletePageFailed'));
            }
        }
    });
}

if (BBUI.elements.pullBtn) {
    new MultiStepButton(BBUI.elements.pullBtn, {
        sound: "Click.mp3",
        action: async () => {
            if (!isBlackboardPageActive()) return;
            const updated = await BBVCS.pull(state, BBUI.getTextareaValue());
            if (updated) {
                await syncView();
                // [Optimization]: 移除 updateBranchList 以消除網絡延遲
            }
        }
    });
}

// FORK: 基於「選中分支」建立新分支
if (BBUI.elements.branchBtn) {
    new MultiStepButton(BBUI.elements.branchBtn, {
        sound: "UIPipboyOK.mp3",
        action: async () => {
            BBSync.cancelPendingCommit();
            const selected = getSelectedBranchInfo();
            if (!selected) return;

            const msg = BBMessage.loading(t('blackboard.forking'));
            try {
                // 如果 Fork 的是對象是當前編輯的分支，先存檔
                if (selected.id === state.branchId) {
                    await BBVCS.save(state, BBUI.getTextareaValue());
                }

                const newId = Date.now();
                // 從選中的分支（不論 local 或 remote）Fork
                const sourceOwner = selected.isLocal ? "local" : "remote";
                await BBCore.forkBranch(sourceOwner, selected.id, newId);

                // [Fix]: Fork 後不自動切換，停留在當前分支
                // 僅更新列表以顯示新分支

                msg.update(t('blackboard.forkComplete'));
                // await syncView(); // 不需要同步視圖，因為沒切換
                await updateBranchList();
            } catch (e) {
                console.error("FORK ERROR:", e);
                msg.close();
                BBMessage.error(t('blackboard.forkFailed'));
            }
        }
    });
}

// COMMIT: 將「選中分支」推送到雲端
if (BBUI.elements.commitBtn) {
    new MultiStepButton(BBUI.elements.commitBtn, {
        sound: "UIPipboyOKPress.mp3",
        steps: 1,
        action: async () => {
            BBSync.cancelPendingCommit();
            const selected = getSelectedBranchInfo();
            if (!selected) return;

            // [Git Logic]: 必須先有本地資料才能 Commit
            if (!selected.isLocal) {
                BBMessage.error(t('blackboard.pullRequired'));
                return;
            }

            const msg = BBMessage.loading(t('blackboard.syncing'));
            try {
                // 如果 Commit 的是對象是當前編輯的分支，先存檔
                if (selected.id === state.branchId) {
                    await BBVCS.save(state, BBUI.getTextareaValue());
                }

                await BBVCS.commit({ branchId: selected.id, branch: selected.name }, BBSync.deviceId);
                msg.update(t('blackboard.syncComplete'));
                // P2: Refresh chips immediately so file status shows 'synced' after commit
                if (selected.id === state.branchId) await syncView();
                await updateBranchList();
                // Cross-tab notify: other tabs of this device need to see the
                // records' owner tag flip [asynced] → [synced] in their
                // branch list. Without this, Tab2's branch stays stuck on
                // [asynced] until its own 5s poll fires (or it happens to
                // mutate something and trigger its own updateBranchList).
                CrossTabSync.broadcast('bb:record:mutated', { branchId: selected.id, timestamp: null });
            } catch (e) {
                msg.close();
                // NO DATA is not a real error — branch contains nothing
                // commit-worthy (all records blank, no files). Treat it
                // as an info notice instead of a SYNC ERROR; logging it
                // as `console.error` filled the console with red noise
                // every time auto-cleanup left a branch empty.
                if (e.message === t('blackboard.noData')) {
                    BBMessage.info(t('blackboard.noData'));
                    return;
                }
                console.error("SYNC ERROR:", e);
                const isUserError = e.status >= 400 && e.status < 500;
                BBMessage.error(isUserError ? (e.message || t('blackboard.syncFailed')) : t('blackboard.syncFailed'));
            }
        }
    });
}

// CHECKOUT/SWITCH: Dynamic dual-state button
// - Same branch as HEAD → CHECKOUT (re-download from server, overwrites local)
// - Different branch     → SWITCH  (change active branch)
// 3-step confirm (Kill → Killx2 → Kill!) via MultiStepButton with dynamicLabel.
// Label is set by updateCheckoutButtonState; MultiStepButton reads textContent
// fresh each arming and applies the x2/! formula.
const checkoutBtnEl = BBUI.elements.checkoutBtn;
let currentCheckoutAction = null;
let checkoutButtonTimer = null;
let checkoutMsb = null;

function updateCheckoutButtonState() {
    if (!checkoutBtnEl) return;

    // Reset any armed state before swapping the label — otherwise CHECKOUTx2
    // lingers as SWITCHx2 and the armed action is tied to the old branch.
    checkoutMsb?.reset();

    const selected = getSelectedBranchInfo();
    if (!selected) {
        checkoutBtnEl.textContent = t('common.na');
        checkoutBtnEl.disabled = true;
        currentCheckoutAction = null;
        return;
    }
    checkoutBtnEl.disabled = false;

    if (selected.id === state.branchId) {
        // Same branch as HEAD → Checkout (pull from server)
        checkoutBtnEl.textContent = t('blackboard.checkoutBtn');
        checkoutBtnEl.dataset.hint = 'hints.checkout';
        currentCheckoutAction = "checkout";
    } else {
        // Different branch → Switch
        checkoutBtnEl.textContent = t('blackboard.switchBtn');
        checkoutBtnEl.dataset.hint = 'hints.switch';
        currentCheckoutAction = "switch";
    }
}

if (checkoutBtnEl) {
    checkoutMsb = new MultiStepButton(checkoutBtnEl, {
        sound: "Click.mp3",
        // CHECKOUT overwrites local with the server copy — 3-step confirm.
        // SWITCH just moves the editor pointer to another branch; if the
        // new branch is local, no data is destroyed; if it's remote, the
        // initial fetch is a read, not an overwrite. 1-click.
        steps: 1,
        dynamicLabel: true,
        action: async () => {
            if (!currentCheckoutAction) return;
            const selected = getSelectedBranchInfo();
            if (!selected) return;

            BBSync.cancelPendingCommit();

            let msg;
            try {
                if (currentCheckoutAction === "checkout") {
                    // Re-download from server (always remote)
                    msg = BBMessage.loading(t('blackboard.loading'));
                    await BBVCS.checkout(state, selected.id, "remote");
                    msg.update(t('blackboard.loadComplete'));
                } else {
                    // Switch to a different branch
                    msg = BBMessage.loading(t('blackboard.switching'));
                    const targetOwner = selected.isLocal ? "local" : "remote";
                    await BBVCS.checkout(state, selected.id, targetOwner);
                    msg.update(t('blackboard.switchComplete'));
                }

                await syncView();
                await updateBranchList();
                updateCheckoutButtonState();
            } catch (e) {
                console.error("CHECKOUT/SWITCH ERROR:", e);
                if (msg) msg.close();
                BBMessage.error(t('blackboard.loadFailed'));
            }
        }
    });
}

// DROP: 動態三態按鈕 — CLEAN/DROP/DELETE 依選取狀態切換。
// 3-step confirm (Kill → Killx2 → Kill!) 只在 CLEAN(會消滅本地未提交內容)時生效;
// DROP(砍雲端副本,本地還在)和 DELETE(刪空白本地分支,雲端還在)都走 1-click instant,
// 以 `steps: () => n` 動態決定。
const dropBtnEl = document.getElementById("drop-btn");
let currentDropAction = null;
let dropButtonTimer = null;
let dropMsb = null;

async function updateDropButtonState() {
    if (!dropBtnEl) return;

    // Reset any armed countdown before label swap — otherwise CLEANx2 can linger
    // as DROPx2 with the wrong action wired up.
    dropMsb?.reset();

    const selected = getSelectedBranchInfo();
    if (!selected) {
        dropBtnEl.textContent = t('common.na');
        dropBtnEl.disabled = true;
        currentDropAction = null;
        delete dropBtnEl.dataset.hint;
        return;
    }
    dropBtnEl.disabled = false;

    // 檢測內容狀態 (Async)
    let hasContent = false;
    if (selected.isLocal) {
        const count = await BBCore.countRecords("local", selected.id);
        if (count > 1) {
            hasContent = true;
        } else if (count === 1) {
            const latest = await BBCore.getRecord("local", selected.id, 0);
            if (latest && latest.text && latest.text.trim() !== "") {
                hasContent = true;
            }
        }
    }

    // 決策矩陣
    // 1. Local & Content -> CLEAN
    if (selected.isLocal && hasContent) {
        dropBtnEl.textContent = t('blackboard.cleanStep1');
        dropBtnEl.dataset.hint = 'hints.dropClean';
        currentDropAction = "clean";
    }
    // 2. Cloud (且無 Local Content 需清理) -> DROP
    else if (selected.isServer) {
        dropBtnEl.textContent = t('blackboard.dropStep1');
        dropBtnEl.dataset.hint = 'hints.dropDrop';
        currentDropAction = "drop";
    }
    // 3. Local (且無 Content, 無 Cloud) -> DELETE
    else if (selected.isLocal) {
        dropBtnEl.textContent = t('blackboard.deleteStep1');
        dropBtnEl.dataset.hint = 'hints.dropDelete';
        currentDropAction = "delete";
    } else {
        dropBtnEl.textContent = t('common.na');
        delete dropBtnEl.dataset.hint;
        currentDropAction = null;
    }
}

if (dropBtnEl) {
    dropMsb = new MultiStepButton(dropBtnEl, {
        sound: "UIGeneralCancel.mp3",
        steps: 1,
        dynamicLabel: true,
        action: async () => {
            if (!currentDropAction) return;

            const selected = getSelectedBranchInfo();
            if (!selected) return;

            BBSync.cancelPendingCommit();

            let msg;
            try {
                if (currentDropAction === "clean") {
                    msg = BBMessage.loading(t('blackboard.cleaning'));
                    await BBCore.clearBranchRecords("local", selected.id);
                    // 若清理的是當前分支，需重置 Head + state.owner
                    if (selected.id === state.branchId) {
                        state.currentHead = 0;
                        // clearBranchRecords deletes everything startsWith('local')
                        // and inserts a single blank placeholder with owner
                        // "local" (literal). If state.owner was a specific tag
                        // like [synced], syncView's exact-index lookup misses
                        // the new placeholder entirely and paints blank — same
                        // class of bug as the rename / reorder drift fixed
                        // earlier. Drop to the "local" catch-all.
                        state.owner = "local";
                        await syncView();
                    }
                    msg.update(t('blackboard.cleanComplete'));
                }
                else if (currentDropAction === "drop") {
                    msg = BBMessage.loading(t('blackboard.dropping'));
                    await BlackboardService.deleteBranch(selected.id);
                    msg.update(t('blackboard.dropComplete'));
                }
                else if (currentDropAction === "delete") {
                    msg = BBMessage.loading(t('blackboard.deleting'));
                    await BBCore.deleteLocalBranch("local", selected.id);

                    if (selected.id === state.branchId) {
                        await initBoard();
                    }
                    msg.update(t('blackboard.deleteComplete'));
                }

                // 操作完成後刷新列表與按鈕狀態
                await updateBranchList();
                await updateDropButtonState();
            } catch (e) {
                console.error("DROP ACTION FAILED:", e);
                if (msg) msg.close();
                BBMessage.error(t('blackboard.actionFailed'));
            }
        }
    });
}

// 監聽選取變更與列表刷新 (guard: only react to VCS list, not mods/broadcast lists)
const $vcsListContainer = document.querySelector('.vcs-list-container');
window.addEventListener("list:selectionChanged", ({ detail }) => {
    if (!$vcsListContainer?.contains(detail.item)) return;
    // 防抖：避免快速滾動時頻繁查詢 DB
    if (dropButtonTimer) clearTimeout(dropButtonTimer);
    dropButtonTimer = setTimeout(updateDropButtonState, T('frontend.ui.buttonStateDebounce'));
    if (checkoutButtonTimer) clearTimeout(checkoutButtonTimer);
    checkoutButtonTimer = setTimeout(updateCheckoutButtonState, T('frontend.ui.buttonStateDebounce'));
});

window.addEventListener("list:updated", () => {
    setTimeout(updateDropButtonState, T('frontend.ui.buttonStateDebounce'));
    setTimeout(updateCheckoutButtonState, T('frontend.ui.buttonStateDebounce'));
});

// --- 事件監聽區 ---

// Auto-save: textarea input → 200 ms debounced BBVCS.save. One path covers
// cross-tab sync, push/pull defences, and auto-commit scheduling.
BBUI.elements.textarea?.addEventListener("input", () => {
    if (BBUI.elements.savedStatus) BBUI.elements.savedStatus.textContent = t('blackboard.statusUnsaved');

    timers.schedule('save', async () => {
        try {
            await BBVCS.save(state, BBUI.getTextareaValue());
            const headIndicator = state.isVirtual ? "NEW" : state.currentHead;
            BBUI.updateIndicators(state.branch || t('blackboard.branchNameFallback'), headIndicator, true);
            await renderPreviewRail();
        } catch (e) {
            BBUI.updateIndicators(undefined, undefined, false);
            console.warn('[BB] Save failed:', e.message);
        }
    }, T('frontend.input.bbSaveDebounce'));

    BBSync.scheduleAutoCommit();
});

// Preview rail: hover to peek, click to navigate. Peek is READ-ONLY —
// the textarea + topic are locked for the duration of the hover so the
// user can't accidentally edit a past record's content while previewing.
// If they want to edit, they click the block first (which navigates +
// saves + unlocks) then edit normally.
//
// Snapshot is captured on first enter and restored on final leave; the
// active-element guard only matters on the initial entry (can't peek
// while mid-type).
const $previewRail = document.getElementById('bb-preview-rail');

function lockEditors(locked) {
    if (BBUI.elements.textarea) BBUI.elements.textarea.readOnly = locked;
}

// Tier 24 — content search pill docked at the bottom of the preview
// rail. Root is the rail itself (not the editor-wrapper) so the
// toggle sits visually under the last preview block, exactly where
// the user's eye already rests when scanning history. Reads from the
// same `_previewRailCache` that backs the rail. `_navigateToHead` is
// the shared save + syncView path used by rail clicks / drag-and-drop
// so a search jump lands with identical side effects.
const bbSearch = attachContentSearch({
    root: $previewRail,
    placement: 'rail',
    getRecords: () => _previewRailCache,
    getCurrentHead: () => state.isVirtual ? null : state.currentHead,
    navigateTo: (head) => _navigateToHead(head),
});

$previewRail?.addEventListener('mouseover', (e) => {
    const block = e.target.closest('.page-preview-block');
    if (!block) return;
    if (!_hoverSnapshot && document.activeElement === BBUI.elements.textarea) return;
    const head = parseInt(block.dataset.head, 10);
    if (Number.isNaN(head) || head < 0) return;
    const rec = _previewRailCache[head];
    if (!rec) return;
    if (!_hoverSnapshot) {
        _hoverSnapshot = { body: BBUI.elements.textarea?.value ?? '' };
        lockEditors(true);
    }
    BBUI.setTextarea(rec.text || '');
});

$previewRail?.addEventListener('mouseleave', () => {
    if (!_hoverSnapshot) return;
    BBUI.setTextarea(_hoverSnapshot.body);
    _hoverSnapshot = null;
    lockEditors(false);
});

async function _navigateToHead(head) {
    if (_hoverSnapshot) {
        BBUI.setTextarea(_hoverSnapshot.body);
        _hoverSnapshot = null;
    }
    lockEditors(false);
    _clearPeekMarker();
    await BBVCS.save(state, BBUI.getTextareaValue());
    state.isVirtual = false;
    state.currentHead = head;
    await syncView();
}

$previewRail?.addEventListener('click', async (e) => {
    const block = e.target.closest('.page-preview-block');
    if (!block) return;
    const head = parseInt(block.dataset.head, 10);
    if (Number.isNaN(head) || head < 0) return;
    await _navigateToHead(head);
});

// Mobile touch: long-press enters preview mode (300 ms), `touchmove`
// tracks the block under the finger via `elementFromPoint` (mirrors the
// desktop hover semantic where moving over a block swaps the preview),
// and `touchend` restores the snapshot. A release *before* 300 ms falls
// through as a click → navigation. `touch-action: none` on the rail
// (CSS) keeps the browser from hijacking this gesture for scrolling.
let _touchTimer = null;
let _touchStartPos = null;
let _inTouchPeek = false;

function _clearPeekMarker() {
    $previewRail?.querySelectorAll('.peeking').forEach(el => el.classList.remove('peeking'));
}

function _peekBlockFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return el?.closest?.('.page-preview-block') || null;
}

function _applyPeek(block) {
    if (!block) return;
    const head = parseInt(block.dataset.head, 10);
    if (Number.isNaN(head) || head < 0) return;
    const rec = _previewRailCache[head];
    if (!rec) return;
    _clearPeekMarker();
    block.classList.add('peeking');
    BBUI.setTextarea(rec.text || '');
}

$previewRail?.addEventListener('touchstart', (e) => {
    const block = e.target.closest('.page-preview-block');
    if (!block) return;
    const touch = e.touches[0];
    const startHead = parseInt(block.dataset.head, 10);
    _touchStartPos = { x: touch.clientX, y: touch.clientY, startHead };
    _touchTimer = setTimeout(() => {
        _touchTimer = null;
        _inTouchPeek = true;
        if (document.activeElement === BBUI.elements.textarea) return;
        _hoverSnapshot = { body: BBUI.elements.textarea?.value ?? '' };
        lockEditors(true);
        _applyPeek(block);
    }, 300);
}, { passive: true });

$previewRail?.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    // If the user drags before the peek timer fires, cancel the peek
    // (treat as a scroll gesture). Threshold 10 px matches native
    // click-vs-drag disambiguation.
    if (_touchTimer && _touchStartPos) {
        const dx = touch.clientX - _touchStartPos.x;
        const dy = touch.clientY - _touchStartPos.y;
        if (dx * dx + dy * dy > 100) {
            clearTimeout(_touchTimer);
            _touchTimer = null;
            return;
        }
    }
    if (!_inTouchPeek) return;
    const block = _peekBlockFromPoint(touch.clientX, touch.clientY);
    _applyPeek(block);
}, { passive: true });

$previewRail?.addEventListener('touchend', async (e) => {
    if (_touchTimer) {
        clearTimeout(_touchTimer);
        _touchTimer = null;
        // Short tap — treat as click navigate. Find the block the
        // original touchstart was on via the changedTouches final
        // position (touchend has no e.touches).
        const t = e.changedTouches[0];
        const block = _peekBlockFromPoint(t.clientX, t.clientY);
        if (block) {
            const head = parseInt(block.dataset.head, 10);
            if (!Number.isNaN(head) && head >= 0) {
                e.preventDefault();
                await _navigateToHead(head);
            }
        }
        _touchStartPos = null;
        return;
    }
    if (_inTouchPeek) {
        _inTouchPeek = false;
        // Drag-and-drop swap (Tier 22): if the finger released on a
        // DIFFERENT block than it started on, treat the peek-drag as a
        // record reorder. Both heads must be valid (≥ 0 — virtual block
        // dataset.head == "-1" disqualifies).
        const endTouch = e.changedTouches[0];
        const endBlock = _peekBlockFromPoint(endTouch.clientX, endTouch.clientY);
        const endHead = endBlock ? parseInt(endBlock.dataset.head, 10) : -1;
        const startHead = _touchStartPos?.startHead ?? -1;

        if (_hoverSnapshot) {
            BBUI.setTextarea(_hoverSnapshot.body);
            _hoverSnapshot = null;
        }
        lockEditors(false);
        _clearPeekMarker();

        if (startHead >= 0 && endHead >= 0 && startHead !== endHead) {
            try {
                await BBCore.swapRecordsByHead(state.owner, state.branchId, startHead, endHead);
                state.owner = "local";
                state.currentHead = endHead;
                await syncView();
                await updateBranchList();
                BBSync.scheduleAutoCommit();
                CrossTabSync.broadcast('bb:record:mutated', { branchId: state.branchId, timestamp: null });
            } catch (err) {
                console.error('BB touch reorder failed:', err);
            }
        }
    }
    _touchStartPos = null;
});

// HTML5 drag-and-drop for desktop. Block is draggable; dropping on
// another block swaps via swapRecordsByHead. Mirrors the mobile
// release-on-different-block semantic.
$previewRail?.addEventListener('dragstart', (e) => {
    const block = e.target.closest?.('.page-preview-block');
    if (!block) return;
    const head = parseInt(block.dataset.head, 10);
    if (Number.isNaN(head) || head < 0) return;
    e.dataTransfer.setData('text/plain', String(head));
    e.dataTransfer.effectAllowed = 'move';
    block.classList.add('dragging');
});

$previewRail?.addEventListener('dragend', (e) => {
    const block = e.target.closest?.('.page-preview-block');
    if (block) block.classList.remove('dragging');
});

$previewRail?.addEventListener('dragover', (e) => {
    if (e.target.closest?.('.page-preview-block')) e.preventDefault();
});

$previewRail?.addEventListener('drop', async (e) => {
    e.preventDefault();
    const block = e.target.closest?.('.page-preview-block');
    if (!block) return;
    const fromHead = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const toHead = parseInt(block.dataset.head, 10);
    if (Number.isNaN(fromHead) || Number.isNaN(toHead)) return;
    if (fromHead < 0 || toHead < 0 || fromHead === toHead) return;
    try {
        await BBCore.swapRecordsByHead(state.owner, state.branchId, fromHead, toHead);
        state.owner = "local";
        state.currentHead = toHead;
        await syncView();
        await updateBranchList();
        BBSync.scheduleAutoCommit();
        CrossTabSync.broadcast('bb:record:mutated', { branchId: state.branchId, timestamp: null });
    } catch (err) {
        console.error('BB drag reorder failed:', err);
    }
});

$previewRail?.addEventListener('touchcancel', () => {
    if (_touchTimer) { clearTimeout(_touchTimer); _touchTimer = null; }
    if (_inTouchPeek) {
        _inTouchPeek = false;
        if (_hoverSnapshot) {
            BBUI.setTextarea(_hoverSnapshot.body);
            _hoverSnapshot = null;
        }
        lockEditors(false);
        _clearPeekMarker();
    }
    _touchStartPos = null;
});

// 監聯分支更名事件
// Flow: renameBranch() updates IndexedDB FIRST, then updateBranchList() re-renders.
// The _listBusy guard prevents the 5s poll from racing and rendering stale data.
// Focus protection prevents re-render during typing (change only fires on blur/Enter).
window.addEventListener("blackboard:branchRename", async (e) => {
    const { branchId, newName } = e.detail;
    await BBCore.renameBranch("local", branchId, newName);
    if (branchId === state.branchId) {
        state.branch = newName;
        // Force state.owner back to the "local" literal catch-all.
        // renameBranch applies markAsynced() per record, which changes
        // [synced] → [asynced] but leaves pure-'local' records untouched.
        // That leaves the branch with mixed owner tags, so any specific
        // tag on state.owner only matches a subset of records and breaks
        // navigation (getRecord goes to exact-index lookup for non-'local'
        // owners). The 'local' literal triggers the startsWith('local')
        // branch in getRecord which sees every variant.
        state.owner = "local";
        BBUI.updateIndicators(state.branch || t('blackboard.branchNameFallback'), state.currentHead, true);
    }
    await updateBranchList();
    BBSync.scheduleAutoCommit();
    // Notify sibling tabs: they re-derive state.owner from DB and repaint
    // the branch tag (now asynced) via the same listener attach/detach use.
    CrossTabSync.broadcast('bb:record:mutated', { branchId, timestamp: null });
});

// 監聽授權變動 (登入/登出)
window.addEventListener("auth:updated", async () => {
    timers.cancelAll();
    BBSync.stopListening();
    // [Fix]: Ensure we don't lose local state visibility on auth change
    // Force a re-init to ensure UI reflects current data
    await initBoard();
    if (localStorage.getItem('currentUser') && Settings.get('bb', 'autoSync')) {
        BBSync.startListening();
    }
});

// 頁面切換時重繪指標 (無需讀 DB，使用記憶體中的狀態)
window.addEventListener('navi:pageChanged', (e) => {
    if (!e.detail?.page?.startsWith('blackboard-')) return;
    const head = state.isVirtual ? 'NEW' : state.currentHead;
    BBUI.updateIndicators(state.branch || t('blackboard.branchNameFallback'), head, true);
});

// 監聽列表刷新 (Infinite List 初始化)
window.addEventListener("list:updated", () => {
    setTimeout(() => initAllInfiniteLists(), 10);
});

// 監聽設定變更
window.addEventListener('settings:changed', (e) => {
    const d = e.detail;
    // Tier 18: maxSlot / loopList settings removed — hardcoded behaviour
    // (100-page cap; no list loop). Only autoSync remains observable here.
    // React to autoSync toggle
    if ((d.scope === 'bb' && d.key === 'autoSync') || d.scope === 'all') {
        if (Settings.get('bb', 'autoSync') && localStorage.getItem('currentUser')) {
            BBSync.startListening();
            // Use recover() (timestamp-based) instead of scheduleAutoCommit() to
            // avoid overwriting newer server content with stale local data when
            // another device made edits while this one had autoSync off.
            BBSync.recover();
        } else {
            BBSync.stopListening();
        }
    }
});

// --- Branch Search ---
// Match against every visible label on the row (name input, timestamp,
// owner display e.g. "local, online/alice [synced]"), so the user can
// filter by status words like "synced", "asynced", "local" in addition
// to the branch name.
const $vcsSearch = document.getElementById('vcs-search');
const $vcsListContainerEl = document.querySelector('.vcs-list-container');

function applyVcsSearch() {
    if (!$vcsListContainerEl) return;
    const query = ($vcsSearch?.value || '').toLowerCase().trim();
    $vcsListContainerEl.querySelectorAll('.vcs-list-item').forEach(item => {
        item.style.display = matchesQuery(item, query) ? '' : 'none';
    });
    // Refresh InfiniteList so wheel + .active navigation only visits the
    // visible rows — otherwise the cursor can jump to filtered-out items.
    listInstances.get($vcsListContainerEl)?.refresh();
}

$vcsSearch?.addEventListener('input', applyVcsSearch);

// Re-apply the filter automatically whenever the list re-renders.
// updateBranchList() rebuilds every row on poll / broadcast / cursor-
// driven signature change, and the fresh rows default to display:''.
// Observing childList on the container lets us reinstate the filter
// without having to instrument every render path explicitly.
if ($vcsListContainerEl) {
    new MutationObserver(() => applyVcsSearch())
        .observe($vcsListContainerEl, { childList: true });
}

/**
 * Shared list-item filter helper: collects every piece of user-visible
 * text on a row (static DOM text + any input's current value) and
 * returns true if the lowercased query is a substring of it. Empty
 * query always matches (no filter active).
 */
function matchesQuery(item, query) {
    if (!query) return true;
    let text = item.innerText.toLowerCase();
    item.querySelectorAll('input, textarea').forEach(el => {
        const v = el.value;
        if (v) text += ' ' + v.toLowerCase();
    });
    return text.includes(query);
}

// --- 系統啟動 ---
initBoard();

// --- Auto-Sync 初始化 ---
BBSync.init({
    getState: () => state,
    getTextareaValue: () => BBUI.getTextareaValue(),
    onRemoteUpdate: () => syncView(),
    onBranchListUpdate: () => updateBranchList(),
});
if (localStorage.getItem('currentUser') && Settings.get('bb', 'autoSync')) {
    BBSync.startListening();
}

// --- 同步機制：處理多裝置更新 ---

/**
 * 焦點恢復同步：當使用者切換回此分頁時自動刷新清單
 */
window.addEventListener("focus", () => {
    // 只有在非初始化狀態下且黑板頁面活躍時才執行
    if (!isInitializing && isBlackboardPageActive()) {
        updateBranchList();
    }
});

/**
 * Auto-Sync: visibilitychange — flush on hide, recover on show
 */
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        BBSync.flush();
    } else {
        BBSync.recover();
    }
});

/**
 * Cross-tab sync: another tab on this device mutated a BB record
 * (rename, attach/detach, text save) → re-render current view and
 * refresh the branch list so [synced]/[asynced] tags reflect reality.
 * Guarded against overwriting an actively-typing user.
 */
CrossTabSync.on('bb:record:mutated', async (detail) => {
    if (!detail) return;

    // updateBranchList ALWAYS runs — it renders the whole VCS list, so a
    // cross-branch mutation (Tab1 edits branch A, Tab2 views branch B)
    // must still refresh Tab2's list so branch A's [synced]/[asynced]
    // tag reflects reality. Gating this on branchId === state.branchId
    // was the bug: Tab2 never saw branch A flip to [asynced] until a
    // poll fired 5s later (and only then if nothing else raced).
    updateBranchList();

    // Current-view mutations: only the same-branch case needs textarea
    // repaint + state.owner realignment. Cross-branch events can't
    // touch the current view anyway.
    if (detail.branchId !== state.branchId) return;

    // state.owner stays at the "local" literal catch-all in local mode
    // (see CLAUDE.md Branch-tag invariant). Previous code pulled an
    // arbitrary record's owner tag which broke mixed-ownership navigation.
    state.owner = "local";
    const isTyping = document.activeElement === BBUI.elements.textarea;
    if (!isTyping) {
        syncView();
    }
});

/**
 * Auto-Sync: online — recover when network returns
 */
window.addEventListener('online', () => {
    BBSync.recover();
});

/**
 * 輪詢：每 5s 刷新分支清單（輕量 GET）。
 * 即時內容同步靠 WebSocket (BBSync._handleRemoteEvent)。
 */
let _pollBusy = false;
setInterval(async () => {
    if (_pollBusy) return;

    const loggedInUser = localStorage.getItem("currentUser");
    const activePage = document.querySelector(".page.active");
    const isBlackboardVisible = activePage && activePage.dataset.page && activePage.dataset.page.startsWith("blackboard-");

    if (document.visibilityState === 'visible' && isBlackboardVisible && loggedInUser && !isInitializing) {
        _pollBusy = true;
        try {
            const result = await updateBranchList();
            // Auto-sync fallback: if server has newer data and user isn't actively editing,
            // pull content even when WebSocket event was missed or checkout failed.
            if (result?.serverNewer && Settings.get('bb', 'autoSync') && !BBSync.hasPendingEdits) {
                const fetched = await BBVCS.checkout(state, state.branchId, 'remote');
                if (fetched) await syncView();
            }
        } catch (err) {
            // [Bug 3 fix]: silent catch swallowed all errors. Log so we can debug.
            console.warn('[BB poll] sync failed:', err);
        }
        _pollBusy = false;
    }
}, T('frontend.background.bbPollInterval'));

// PWA logic extracted to pwa.js
import "./pwa.js";
