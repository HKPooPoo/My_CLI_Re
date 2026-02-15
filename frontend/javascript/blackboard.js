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
            lastUpdate: b.lastUpdate,
            displayTime: getHKTTimestamp(b.id),
            isLocal: true,
            isServer: false,
            isDirty: false
        });
    });

    // 處理雲端數據 (若已登入)
    if (loggedInUser) {
        try {
            const res = await fetch('/api/blackboard/branches', { credentials: 'include' });
            const data = await res.json();

            data.branches.forEach(sb => {
                const sid = parseInt(sb.branch_id);
                const existing = branchMap.get(sid);

                if (existing) {
                    existing.isServer = true;
                    existing.owner = sb.owner;
                    existing.isDirty = (parseInt(sb.last_update) !== existing.lastUpdate);
                } else {
                    branchMap.set(sid, {
                        id: sid,
                        name: sb.branch_name,
                        owner: sb.owner,
                        lastUpdate: parseInt(sb.last_update),
                        displayTime: getHKTTimestamp(sid),
                        isLocal: false,
                        isServer: true,
                        isDirty: true
                    });
                }
            });
        } catch (e) {
            console.error("無法載入雲端分支", e);
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

// --- 按鈕組件初始化 ---

// PUSH / PULL (單階音效按鈕)
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

// FORK: 繼承當前分支內容並建立一個全新的本地 ID
if (BBUI.elements.branchBtn) {
    new MultiStepButton(BBUI.elements.branchBtn, {
        sound: "UIPipboyOK.mp3",
        action: async () => {
            const msg = BBMessage.info("FORK INITIATED...");
            try {
                await BBVCS.save(state, BBUI.getTextareaValue());
                const newId = Date.now();
                await BBCore.forkBranch(state.owner, state.branchId, newId);
                state.branchId = newId;
                state.branch = "";
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

// COMMIT: 將當前分支推送到雲端
if (BBUI.elements.commitBtn) {
    new MultiStepButton(BBUI.elements.commitBtn, {
        sound: "UIPipboyOKPress.mp3",
        action: async () => {
            const msg = BBMessage.info("SYNCING...");
            try {
                await BBVCS.commit(state, BBUI.getTextareaValue());
                msg.update("SYNC COMPLETE.");
                await updateBranchList();
            } catch (e) {
                msg.close();
                BBMessage.error("SYNC FAILED.");
            }
        }
    });
}

// CHECKOUT: 切換分支
if (BBUI.elements.checkoutBtn) {
    new MultiStepButton(BBUI.elements.checkoutBtn, {
        sound: "Click.mp3",
        action: async () => {
            const activeItem = document.querySelector(".vcs-list-item.active");
            if (!activeItem) return;
            const targetId = parseInt(activeItem.dataset.branchId);
            const targetOwner = activeItem.querySelector(".vcs-list-owner").textContent.includes("online/") ? "remote" : "local";

            const msg = BBMessage.info("LOADING...");
            try {
                await BBVCS.checkout(state, targetId, targetOwner);
                msg.update("BRANCH LOADED.");
                await syncView();
                await updateBranchList();
            } catch (e) {
                msg.close();
                BBMessage.error("LOAD FAILED.");
            }
        }
    });
}

// DROP: 三階遞進刪除
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
                const targetId = state.branchId;
                const targetOwner = "local";

                const msg = BBMessage.info("PURGING...");
                try {
                    const records = await BBCore.getAllRecordsForBranch(targetOwner, targetId);
                    const hasText = records.some(r => r.text && r.text.trim() !== "");

                    if (hasText) {
                        await BBCore.clearBranchRecords(targetOwner, targetId);
                        msg.update("STAGE 1: CLEAN.");
                    } else {
                        const activeItem = document.querySelector(".vcs-list-item.active");
                        const isOnline = activeItem?.querySelector(".vcs-list-owner")?.textContent.includes("online/");

                        if (isOnline) {
                            const res = await fetch(`/api/blackboard/branches/${targetId}`, {
                                method: 'DELETE',
                                credentials: 'include'
                            });
                            if (res.ok) {
                                msg.update("STAGE 2: WIPED.");
                            } else {
                                throw new Error();
                            }
                        } else {
                            await BBCore.deleteLocalBranch(targetOwner, targetId);
                            msg.update("STAGE 3: DELETED.");
                            await initBoard();
                            return;
                        }
                    }
                    await syncView();
                    await updateBranchList();
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
    BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, false);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        await BBVCS.save(state, BBUI.getTextareaValue());
        BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
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
