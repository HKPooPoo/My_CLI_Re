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

import { BBCore, getHKTTimestamp } from "./blackboard-core.js";
import { BBVCS } from "./blackboard-vcs.js";
import { BBUI } from "./blackboard-ui.js";
import { BBMessage } from "./blackboard-msg.js";
import { initAllInfiniteLists, listInstances } from "./blackboard-ui-list.js"
import db from "./indexedDB.js"
import { MultiStepButton } from "./multiStepButton.js";
import { BlackboardService } from "./services/blackboard-service.js";
import { playAudio } from "./audio.js";
import { EditorAttachments } from "./editor-attachments.js";
import { t } from './i18n.js';
import * as Settings from './settings.js';
import { registerMetadataProvider } from './mod-board-provider.js';
import { BBSync } from './blackboard-sync.js';
import { TimerGroup } from './timer-group.js';

// --- 全域狀態聲明 ---
const state = {
    owner: "local",      // 當前編輯權限 (通常設為 local)
    branch: "",         // 當前分支名稱 (用於 UI 顯示)
    branchId: 0,        // 當前分支物理 ID
    currentHead: 0,     // 歷史深度指標 (0 表示最新)
    maxSlot: Settings.get('bb', 'maxSlot'),
    isVirtual: false,   // 是否處於「新頁面」的虛擬狀態 (尚未存入 DB)
    currentFileHash: null,
};

const timers = new TimerGroup();
let isInitializing = false;

// Register metadata provider for MOD board data access
registerMetadataProvider('bb', () => ({
    branchId:   state.branchId,
    branchName: state.branch,
    timestamp:  null,  // current record timestamp resolved at read time
    text:       BBUI.getTextareaValue() || '',
    fileHash:   state.currentFileHash,
    owner:      state.owner,
    isVirtual:  state.isVirtual,
    headIndex:  state.currentHead,
}));

// --- File Attachment Instance ---
const bbAttach = EditorAttachments.create({
    dropZoneSelector: '#bb-drop-zone',
    fileInputSelector: '#bb-file-input',
    chipsContainerSelector: '#bb-attachment-chips',
    dropOverlaySelector: '#bb-drop-overlay',
    onAttach: async (hash, meta) => {
        const binData = { hash, ...meta };

        // [Fix]: Handle Virtual State (New Page)
        if (state.isVirtual) {
            await BBCore.addRecord(
                state.owner,
                state.branchId,
                state.branch,
                BBUI.getTextareaValue() || "",
                binData
            );
            state.isVirtual = false;
            state.currentHead = 0;
            BBUI.updateIndicators(state.branch || t('blackboard.branchNameFallback'), state.currentHead, true);
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
                await db.blackboard.update([entry.owner, entry.branch_id, entry.timestamp], { file_hash: fileHashes });
            } else if (state.currentHead === 0) {
                await BBCore.addRecord("local", state.branchId, state.branch, BBUI.getTextareaValue() || "", [binData]);
                state.owner = "local";
                state.currentHead = 0;
            }
        }
        BBSync.scheduleAutoCommit();
    },
    onDetach: async (hash) => {
        const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        if (!entry) return;

        const existing = entry.file_hash;
        if (Array.isArray(existing)) {
            const filtered = existing.filter(f => {
                const h = (typeof f === 'object') ? f.hash : f;
                return h !== hash;
            });
            await db.blackboard.update([entry.owner, entry.branch_id, entry.timestamp], {
                file_hash: filtered.length > 0 ? filtered : null
            });
        } else {
            const currentHash = (typeof existing === 'object') ? existing?.hash : existing;
            if (currentHash === hash) {
                await db.blackboard.update([entry.owner, entry.branch_id, entry.timestamp], { file_hash: null });
            }
        }
        BBSync.scheduleAutoCommit();
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
    // console.log("syncView called. isVirtual:", state.isVirtual);
    // [Fix]: 虛擬狀態處理 (New Page)
    if (state.isVirtual) {
        BBUI.setTextarea("");
        BBUI.updateIndicators(state.branch || t('blackboard.branchNameFallback'), "NEW", false);
        bbAttach?.clear();
        state.currentFileHash = null;
        return;
    }

    const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
    BBUI.setTextarea(entry?.text ?? "");
    BBUI.updateIndicators(state.branch || t('blackboard.branchNameFallback'), state.currentHead, true);

    // Sync attachment chip display (multi-file aware)
    const binData = entry?.file_hash;
    state.currentFileHash = binData ?? null;
    if (Array.isArray(binData)) {
        const hashes = binData.map(f => (typeof f === 'object') ? f.hash : f).filter(Boolean);
        bbAttach?.setFromRecord(hashes);
    } else {
        const hash = (typeof binData === 'object') ? binData?.hash : binData;
        bbAttach?.setFromRecord(hash || null);
    }
}

/**
 * 刷新分支清單 (Local + Remote 混合)
 * 步驟：1. 抓取本地分支 2. 抓取遠端分支 3. 透過 Map 進行 ID 合併 4. 判斷 IsDirty 狀態 5. 排序並渲染
 */
async function updateBranchList() {
    // [Focus Protection]: If user is typing in the list, skip update to prevent focus loss/overwrite
    const isTyping = document.activeElement && document.activeElement.classList.contains('vcs-list-branch');
    if (isTyping) return;

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
                    serverOwner: ""
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
                            // 無腦比對：只要時間戳不一致，就是 asynced
                            existing.isDirty = (serverLastUpdate !== existing.lastUpdate);
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

        const combinedBranches = Array.from(branchMap.values());

        // [Fix]: 移除將當前分支強制置頂的排序邏輯，僅依時間排序
        combinedBranches.sort((a, b) => {
            return b.lastUpdate - a.lastUpdate;
        });

        // [Fix]: 嘗試保留當前選中的分支，若無 (首次加載) 則可考慮預設為當前分支
        const currentSelection = getSelectedBranchInfo();
        const targetSelectionId = currentSelection ? currentSelection.id : state.branchId;

        BBUI.renderBranchList(combinedBranches, targetSelectionId, state.owner, state.branchId);

    } catch (criticalError) {
        console.error("CRITICAL: Failed to update branch list", criticalError);
        BBMessage.error(t('blackboard.listFailed'));
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
        action: async () => {
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
                await updateBranchList();
            } catch (e) {
                console.error("SYNC ERROR:", e);
                msg.close();
                BBMessage.error(t('blackboard.syncFailed'));
            }
        }
    });
}

// CHECKOUT/SWITCH: Dynamic dual-state button (like DROP's 3-state)
// - Same branch as HEAD → CHECKOUT (re-download from server)
// - Different branch     → SWITCH  (change active branch)
const checkoutBtnEl = BBUI.elements.checkoutBtn;
let currentCheckoutAction = null;
let checkoutButtonTimer = null;

function updateCheckoutButtonState() {
    if (!checkoutBtnEl) return;

    const selected = getSelectedBranchInfo();
    if (!selected) {
        checkoutBtnEl.textContent = t('common.na');
        checkoutBtnEl.disabled = true;
        currentCheckoutAction = null;
        return;
    }
    checkoutBtnEl.disabled = false;

    console.log('[CHECKOUT-BTN]', { selectedId: selected.id, stateId: state.branchId, same: selected.id === state.branchId });
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
    checkoutBtnEl.addEventListener("click", async () => {
        if (!currentCheckoutAction) return;
        const selected = getSelectedBranchInfo();
        if (!selected) return;

        playAudio("Click.mp3");

        let msg;
        try {
            if (currentCheckoutAction === "checkout") {
                // Re-download from server (always remote)
                msg = BBMessage.loading(t('blackboard.loading'));
                await BBVCS.checkout(state, selected.id, "remote", { silent: true });
                msg.update(t('blackboard.loadComplete'));
            } else {
                // Switch to a different branch
                msg = BBMessage.loading(t('blackboard.switching'));
                const targetOwner = selected.isLocal ? "local" : "remote";
                await BBVCS.checkout(state, selected.id, targetOwner, { silent: true });
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
    });
}

// DROP: 動態三階刪除 (基於選取狀態)
const dropBtnEl = document.getElementById("drop-btn");
let currentDropAction = null;
let dropButtonTimer = null;

async function updateDropButtonState() {
    if (!dropBtnEl) return;

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
    // 點擊事件：執行當前決策的動作
    dropBtnEl.addEventListener("click", async () => {
        if (!currentDropAction) return;

        const selected = getSelectedBranchInfo();
        if (!selected) return;

        playAudio("UIGeneralCancel.mp3");

        let msg;
        try {
            if (currentDropAction === "clean") {
                msg = BBMessage.loading(t('blackboard.cleaning'));
                await BBCore.clearBranchRecords("local", selected.id);
                // 若清理的是當前分支，需重置 Head
                if (selected.id === state.branchId) {
                    state.currentHead = 0;
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
    });
}

// 監聽選取變更與列表刷新 (guard: only react to VCS list, not mods/broadcast lists)
const $vcsListContainer = document.querySelector('.vcs-list-container');
window.addEventListener("list:selectionChanged", ({ detail }) => {
    if (!$vcsListContainer?.contains(detail.item)) return;
    // 防抖：避免快速滾動時頻繁查詢 DB
    if (dropButtonTimer) clearTimeout(dropButtonTimer);
    dropButtonTimer = setTimeout(updateDropButtonState, 100);
    if (checkoutButtonTimer) clearTimeout(checkoutButtonTimer);
    checkoutButtonTimer = setTimeout(updateCheckoutButtonState, 100);
});

window.addEventListener("list:updated", () => {
    setTimeout(updateDropButtonState, 50);
    setTimeout(updateCheckoutButtonState, 50);
});

// --- 事件監聽區 ---

// 自動儲存：監聽文字框輸入並防抖處理
BBUI.elements.textarea?.addEventListener("input", () => {
    // 立即更新為 UNSAVED，但不要觸發完整的 DOM 重繪
    if (BBUI.elements.savedStatus) BBUI.elements.savedStatus.textContent = t('blackboard.statusUnsaved');

    timers.schedule('save', async () => {
        await BBVCS.save(state, BBUI.getTextareaValue());

        // [Fix]: 狀態更新後，依據是否仍為虛擬狀態顯示指標
        const headIndicator = state.isVirtual ? "NEW" : state.currentHead;
        BBUI.updateIndicators(state.branch || t('blackboard.branchNameFallback'), headIndicator, true);
    }, 200);

    BBSync.scheduleAutoCommit();
});

// 監聽分支更名事件
window.addEventListener("blackboard:branchRename", async (e) => {
    const { branchId, newName } = e.detail;
    await BBCore.renameBranch("local", branchId, newName);
    if (branchId === state.branchId) {
        state.branch = newName;
        BBUI.updateIndicators(state.branch || t('blackboard.branchNameFallback'), state.currentHead, true);
    }
    await updateBranchList();
    BBSync.scheduleAutoCommit();
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
    if (d.scope === 'bb' && d.key === 'maxSlot' || d.scope === 'all') {
        state.maxSlot = Settings.get('bb', 'maxSlot');
    }
    // React to loopList toggle — update all BB InfiniteList instances
    if ((d.scope === 'bb' && d.key === 'loopList') || d.scope === 'all') {
        const loop = Settings.get('bb', 'loopList');
        document.querySelectorAll('.vcs-list-container').forEach(c => {
            const inst = listInstances.get(c);
            if (inst) inst.loop = loop;
        });
    }
    // React to autoSync toggle
    if ((d.scope === 'bb' && d.key === 'autoSync') || d.scope === 'all') {
        if (Settings.get('bb', 'autoSync') && localStorage.getItem('currentUser')) {
            BBSync.startListening();
        } else {
            BBSync.stopListening();
        }
    }
});

// --- Branch Search ---
const $vcsSearch = document.getElementById('vcs-search');
$vcsSearch?.addEventListener('input', () => {
    const query = $vcsSearch.value.toLowerCase().trim();
    const items = document.querySelectorAll('.vcs-list-item');
    items.forEach(item => {
        const name = item.querySelector('.vcs-list-branch')?.value?.toLowerCase() || '';
        item.style.display = name.includes(query) ? '' : 'none';
    });
});

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
 * Auto-Sync: online — recover when network returns
 */
window.addEventListener('online', () => {
    BBSync.recover();
});

/**
 * 輪詢：每 500ms 刷新分支清單（輕量 GET）。
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
        try { await updateBranchList(); } catch (_) {}
        _pollBusy = false;
    }
}, 500);

// PWA logic extracted to pwa.js
import "./pwa.js";
