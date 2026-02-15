import { BBCore, getHKTTimestamp } from "./blackboard-core.js";
import { BBVCS } from "./blackboard-vcs.js";
import { BBUI } from "./blackboard-ui.js";
import { BBMessage } from "./blackboard-msg.js";
import { initAllInfiniteLists } from "./blackboard-ui-list.js"
import db, { Dexie } from "./indexedDB.js"
import { MultiStepButton } from "./multiStepButton.js";

// 初始化全域狀態
const state = {
    owner: "local",
    branch: "",
    branchId: 0,
    currentHead: 0,
    maxSlot: 10
};

let debounceTimer = null;
let isInitializing = false;

/**
 * 黑板初始化入口
 */
export async function initBoard() {
    if (isInitializing) return;
    isInitializing = true;

    try {
        const loggedInUser = localStorage.getItem("currentUser");

        // 永遠從本地 local 分區開始編輯
        state.owner = "local";

        const totalCount = await db.blackboard.count();

        if (totalCount === 0) {
            const newId = Date.now();
            await BBCore.addRecord("local", newId, "master");
            state.branchId = newId;
            state.branch = "master";
        } else {
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

async function syncView() {
    const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
    BBUI.setTextarea(entry?.text ?? "");
    BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
}

async function updateBranchList() {
    const localBranches = await BBCore.getAllBranches("local");
    const loggedInUser = localStorage.getItem("currentUser");

    const branchMap = new Map();

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

// 綁定按鈕事件

// PUSH / PULL
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

// FORK
BBUI.elements.branchBtn?.addEventListener("click", async () => {
    await BBVCS.save(state, BBUI.getTextareaValue());
    const newId = Date.now();
    await BBCore.forkBranch(state.owner, state.branchId, newId);
    state.branchId = newId;
    state.branch = "";
    state.owner = "local";
    state.currentHead = 0;
    localStorage.setItem("currentBranchId", state.branchId);
    BBMessage.info("已完成 Fork (Local)");
    await syncView();
    await updateBranchList();
});

// COMMIT
BBUI.elements.commitBtn?.addEventListener("click", async () => {
    try {
        await BBVCS.commit(state, BBUI.getTextareaValue());
        BBMessage.info("Commit 成功，已同步至雲端");
        await updateBranchList();
    } catch (e) {
        BBMessage.error(e.message);
    }
});

// CHECKOUT
BBUI.elements.checkoutBtn?.addEventListener("click", async () => {
    const activeItem = document.querySelector(".vcs-list-item.active");
    if (!activeItem) return;
    const targetId = parseInt(activeItem.dataset.branchId);
    const targetOwner = activeItem.querySelector(".vcs-list-owner").textContent.includes("online/") ? "remote" : "local";
    try {
        await BBVCS.checkout(state, targetId, targetOwner);
        BBMessage.info("已切換分支");
        await syncView();
        await updateBranchList();
    } catch (e) {
        BBMessage.error(e.message);
    }
});

// DROP (三階遞進刪除)
const dropBtnEl = document.getElementById("drop-btn");
if (dropBtnEl) {
    new MultiStepButton(dropBtnEl, [
        {
            label: "DROP",
            sound: "Click.mp3",
            action: () => BBMessage.info("準備執行遞進刪除...")
        },
        {
            label: "DROP !",
            sound: "UIGeneralCancel.mp3",
            action: async () => {
                const targetId = state.branchId;
                const targetOwner = "local";

                // Stage 1: 檢查是否有內容
                const records = await BBCore.getAllRecordsForBranch(targetOwner, targetId);
                const hasText = records.some(r => r.text && r.text.trim() !== "");

                if (hasText) {
                    await BBCore.clearBranchRecords(targetOwner, targetId);
                    BBMessage.info("Stage 1: 分支內容已清空");
                } else {
                    // Stage 2: 檢查是否有雲端分身
                    const activeItem = document.querySelector(".vcs-list-item.active");
                    const isOnline = activeItem?.querySelector(".vcs-list-owner")?.textContent.includes("online/");

                    if (isOnline) {
                        try {
                            const res = await fetch(`/api/blackboard/branches/${targetId}`, {
                                method: 'DELETE',
                                credentials: 'include'
                            });
                            if (res.ok) {
                                BBMessage.info("Stage 2: 雲端分支已刪除");
                            } else {
                                throw new Error("API 刪除失敗");
                            }
                        } catch (e) {
                            BBMessage.error(`Stage 2 執行中斷: ${e.message}`);
                            return;
                        }
                    } else {
                        // Stage 3: 刪除本地索引
                        await BBCore.deleteLocalBranch(targetOwner, targetId);
                        BBMessage.info("Stage 3: 本地分支全數據已移除");
                        await initBoard();
                        return;
                    }
                }
                await syncView();
                await updateBranchList();
            }
        }
    ], 3000);
}

// 監聽文字框輸入
BBUI.elements.textarea?.addEventListener("input", () => {
    BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, false);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        await BBVCS.save(state, BBUI.getTextareaValue());
        BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
    }, 500);
});

// 監聽改名
window.addEventListener("blackboard:branchRename", async (e) => {
    const { branchId, newName } = e.detail;
    await BBCore.renameBranch("local", branchId, newName);
    if (branchId === state.branchId) {
        state.branch = newName;
        BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
    }
    await updateBranchList();
});

// 其他監聽
window.addEventListener("blackboard:authUpdated", async () => {
    await initBoard();
});

window.addEventListener("blackboard:listUpdated", () => {
    setTimeout(() => initAllInfiniteLists(), 10);
});

// 啟動
initBoard();
