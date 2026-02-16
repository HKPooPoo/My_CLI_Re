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
import { initAllInfiniteLists } from "./blackboard-ui-list.js"
import db from "./indexedDB.js"
import { MultiStepButton } from "./multiStepButton.js";
import { BlackboardService } from "./services/blackboard-service.js";

// --- 全域狀態聲明 ---
const state = {
    owner: "local",      // 當前編輯權限 (通常設為 local)
    branch: "",         // 當前分支名稱 (用於 UI 顯示)
    branchId: 0,        // 當前分支物理 ID
    currentHead: 0,     // 歷史深度指標 (0 表示最新)
    maxSlot: 10         // 本地歷史保存上限
};

let debounceTimer = null;
let isInitializing = false;

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
    } finally {
        isInitializing = false;
    }
}

/**
 * 同步畫面內容
 * 步驟：1. 從 Core 抓取當前 Head 對應的紀錄 2. 更新文字框 3. 更新 UI 指標
 */
async function syncView() {
    const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
    BBUI.setTextarea(entry?.text ?? "");
    BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
}

/**
 * 刷新分支清單 (Local + Remote 混合)
 * 步驟：1. 抓取本地分支 2. 抓取遠端分支 3. 透過 Map 進行 ID 合併 4. 判斷 IsDirty 狀態 5. 排序並渲染
 */
async function updateBranchList() {
    const localBranches = await BBCore.getAllBranches("local");
    const loggedInUser = localStorage.getItem("currentUser");
    const branchMap = new Map();

    // 處理本地數據
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

    // 處理雲端數據 (若已登入)
    if (loggedInUser) {
        try {
            const data = await BlackboardService.fetchBranches();

            data.branches.forEach(sb => {
                const sid = parseInt(sb.branch_id);
                const serverLastUpdate = Number(sb.last_update);
                const existing = branchMap.get(sid);

                if (existing) {
                    existing.isServer = true;
                    existing.serverOwner = sb.owner;
                    // 無腦比對：只要時間戳不一致，就是 asynced
                    existing.isDirty = (serverLastUpdate !== existing.lastUpdate);
                } else {
                    branchMap.set(sid, {
                        id: sid,
                        name: sb.branch_name,
                        owner: "local", // 即使僅在雲端，為了 UI 統一也設為 local
                        lastUpdate: serverLastUpdate,
                        displayTime: getHKTTimestamp(sid),
                        isLocal: false,
                        isServer: true,
                        isDirty: true,
                        serverOwner: sb.owner
                    });
                }
            });
        } catch (e) {
            console.error("FAILED TO LOAD CLOUD BRANCHES", e);
        }
    }

    const combinedBranches = Array.from(branchMap.values());
    combinedBranches.sort((a, b) => {
        const aIsActive = a.id === state.branchId;
        const bIsActive = b.id === state.branchId;
        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;
        return b.lastUpdate - a.lastUpdate;
    });

    BBUI.renderBranchList(combinedBranches, state.branchId, state.owner);
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
if (BBUI.elements.pushBtn) {
    new MultiStepButton(BBUI.elements.pushBtn, {
        sound: "Click.mp3",
        action: async () => {
            const updated = await BBVCS.push(state, BBUI.getTextareaValue());
            if (updated) { await syncView(); await updateBranchList(); }
        }
    });
}

if (BBUI.elements.pullBtn) {
    new MultiStepButton(BBUI.elements.pullBtn, {
        sound: "Click.mp3",
        action: async () => {
            const updated = await BBVCS.pull(state, BBUI.getTextareaValue());
            if (updated) { await syncView(); await updateBranchList(); }
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

            const msg = BBMessage.info("FORK INITIATED...");
            try {
                // 如果 Fork 的是對象是當前編輯的分支，先存檔
                if (selected.id === state.branchId) {
                    await BBVCS.save(state, BBUI.getTextareaValue());
                }

                const newId = Date.now();
                // 從選中的分支（不論 local 或 remote）Fork
                const sourceOwner = selected.isLocal ? "local" : "remote";
                await BBCore.forkBranch(sourceOwner, selected.id, newId);

                // 切換到新 Fork 的分支
                state.branchId = newId;
                state.branch = `${selected.name}_fork`;
                state.owner = "local";
                state.currentHead = 0;
                localStorage.setItem("currentBranchId", state.branchId);

                msg.update("FORK COMPLETE.");
                await syncView();
                await updateBranchList();
            } catch (e) {
                msg.close();
                BBMessage.error("FORK FAILED.");
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
                BBMessage.error("ERROR: LOCAL SYNC REQUIRED. PULL FIRST.");
                return;
            }

            const msg = BBMessage.info("SYNCING TO CLOUD...");
            try {
                // 如果 Commit 的是對象是當前編輯的分支，先存檔
                if (selected.id === state.branchId) {
                    await BBVCS.save(state, BBUI.getTextareaValue());
                }

                await BBVCS.commit({ branchId: selected.id, branch: selected.name });
                msg.update("SYNC COMPLETE.");
                await updateBranchList();
            } catch (e) {
                msg.close();
                BBMessage.error(e.message || "SYNC FAILED.");
            }
        }
    });
}

// CHECKOUT: 切換/下載分支
if (BBUI.elements.checkoutBtn) {
    new MultiStepButton(BBUI.elements.checkoutBtn, {
        sound: "Click.mp3",
        action: async () => {
            const selected = getSelectedBranchInfo();
            if (!selected) return;

            const msg = BBMessage.info("LOADING BRANCH...");
            try {
                // 如果選中的是 remote 且 dirty，BBVCS.checkout 會負責下載
                const targetOwner = selected.isServer ? "remote" : "local";
                await BBVCS.checkout(state, selected.id, targetOwner);

                msg.update("BRANCH READY.");
                await syncView();
                await updateBranchList();
            } catch (e) {
                msg.close();
                BBMessage.error("LOAD FAILED.");
            }
        }
    });
}

// DROP: 三階遞進刪除 (針對選中分支)
const dropBtnEl = document.getElementById("drop-btn");
if (dropBtnEl) {
    new MultiStepButton(dropBtnEl, [
        {
            label: "DROP",
            sound: "Click.mp3",
            action: () => BBMessage.info("DROP READY.")
        },
        {
            label: "DROP !",
            sound: "UIGeneralCancel.mp3",
            action: async () => {
                const selected = getSelectedBranchInfo();
                if (!selected) return;

                const targetId = selected.id;
                const msg = BBMessage.info("PURGING...");
                try {
                    // Stage 1: 清空歷史本身 (如果紀錄超過 1 筆，或者唯一的那筆有文字)
                    if (selected.isLocal) {
                        const count = await BBCore.countRecords("local", targetId);
                        const latest = await BBCore.getRecord("local", targetId, 0);
                        const hasContent = latest && latest.text && latest.text.trim() !== "";

                        if (count > 1 || hasContent) {
                            await BBCore.clearBranchRecords("local", targetId);
                            msg.update("STAGE 1: CLEAN.");
                            await updateBranchList();
                            if (targetId === state.branchId) {
                                state.currentHead = 0;
                                await syncView();
                            }
                            return;
                        }
                    }

                    // Stage 2: 如果雲端有資料且本地已清空歷史，則刪除雲端 (WIPED)
                    if (selected.isServer) {
                        try {
                            await BlackboardService.deleteBranch(targetId);
                            msg.update("STAGE 2: WIPED.");
                            await updateBranchList();
                            return;
                        } catch (e) {
                            throw new Error("SERVER_DELETE_FAILED");
                        }
                    }

                    // Stage 3: 如果雲端已刪除或本來就沒有，且本地已清空，則刪除本地 (DELETED)
                    if (selected.isLocal) {
                        await BBCore.deleteLocalBranch("local", targetId);
                        msg.update("STAGE 3: DELETED.");
                    }

                    // 如果刪除的是當前正在編輯的分支，重置系統
                    if (targetId === state.branchId) {
                        await initBoard();
                    } else {
                        await updateBranchList();
                    }
                } catch (e) {
                    msg.close();
                    BBMessage.error("PURGE ERROR.");
                }
            }
        }
    ], 3000);
}

// --- 事件監聽區 ---

// 自動儲存：監聽文字框輸入並防抖處理
BBUI.elements.textarea?.addEventListener("input", () => {
    // 立即更新為 UNSAVED，但不要觸發完整的 DOM 重繪
    if (BBUI.elements.savedStatus) BBUI.elements.savedStatus.textContent = "UNSAVED";

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        await BBVCS.save(state, BBUI.getTextareaValue());
        BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
        await updateBranchList(); // 立即更新清單同步狀態
    }, 500);
});

// 監聽分支更名事件
window.addEventListener("blackboard:branchRename", async (e) => {
    const { branchId, newName } = e.detail;
    await BBCore.renameBranch("local", branchId, newName);
    if (branchId === state.branchId) {
        state.branch = newName;
        BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
    }
    await updateBranchList();
});

// 監聽授權變動 (登入/登出)
window.addEventListener("blackboard:authUpdated", async () => {
    await initBoard();
});

// 監聽列表刷新 (Infinite List 初始化)
window.addEventListener("blackboard:listUpdated", () => {
    setTimeout(() => initAllInfiniteLists(), 10);
});

// --- 系統啟動 ---
initBoard();

// --- 同步機制：處理多裝置更新 ---

/**
 * 焦點恢復同步：當使用者切換回此分頁時自動刷新清單
 */
window.addEventListener("focus", () => {
    // 只有在非初始化狀態下才執行，避免重疊
    if (!isInitializing) {
        updateBranchList();
    }
});

/**
 * 低頻輪詢：僅在視窗處於焦點且位於黑板頁面時，每 秒自動檢查一次雲端分支狀態
 */
setInterval(() => {
    const loggedInUser = localStorage.getItem("currentUser");
    const blackboardPage = document.getElementById("page-blackboard");
    const isVisible = blackboardPage && blackboardPage.style.display !== "none";

    if (document.visibilityState === 'visible' && isVisible && loggedInUser && !isInitializing) {
        updateBranchList();
    }
}, 1000);

/**
 * PWA Service Worker 註冊
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.warn('PWA: Service Worker registration failed:', err);
        });
    });
}
