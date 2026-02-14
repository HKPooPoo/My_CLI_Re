import { BBCore } from "./blackboard-core.js";
import { BBVCS } from "./blackboard-vcs.js";
import { BBUI } from "./blackboard-ui.js";
import { BBMessage } from "./blackboard-msg.js";
import { initAllInfiniteLists } from "./blackboard-ui-list.js"
import db from "./indexedDB.js"

// 初始化全域狀態
const state = {
    owner: "guest",
    branch: "master",
    branchId: 0, // 分支的唯一 Immutable ID (Timestamp)
    currentHead: 0,
    maxSlot: 10
};

let debounceTimer = null;

/**
 * 黑板初始化入口
 */
export async function initBoard() {
    state.owner = localStorage.getItem("currentUser") || "guest";

    // 獲取該使用者的全部分支
    const branches = await BBCore.getAllBranches(state.owner);

    if (branches.length > 0) {
        // 嘗試讀取上次使用的分支，若不存在則取最新的一筆
        const lastBranchId = parseInt(localStorage.getItem("currentBranchId"));
        const activeBranch = branches.find(b => b.id === lastBranchId) || branches[0];

        state.branchId = activeBranch.id;
        state.branch = activeBranch.name;
    } else {
        // 完全沒有分支時，建立一個初始 master
        const newId = Date.now();
        await BBCore.addRecord(state.owner, newId, "master");
        state.branchId = newId;
        state.branch = "master";
    }

    localStorage.setItem("currentBranchId", state.branchId);
    state.currentHead = 0;

    await syncView();
    await updateBranchList();
}

/**
 * 將資料庫內容同步至 UI
 */
async function syncView() {
    const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
    BBUI.setTextarea(entry?.text ?? "");
    BBUI.updateIndicators(state.branch, state.currentHead, true);
}

/**
 * 更新並顯示分支清單
 */
async function updateBranchList() {
    const branches = await BBCore.getAllBranches(state.owner);
    BBUI.renderBranchList(branches, state.branchId);
}

// 綁定按鈕事件
BBUI.elements.pushBtn?.addEventListener("click", async () => {
    const updated = await BBVCS.push(state, BBUI.getTextareaValue());
    if (updated) {
        await syncView();
        await updateBranchList();
    }
});

BBUI.elements.pullBtn?.addEventListener("click", async () => {
    const updated = await BBVCS.pull(state, BBUI.getTextareaValue());
    if (updated) {
        await syncView();
        await updateBranchList();
    }
});

// 監聽文字框輸入
BBUI.elements.textarea?.addEventListener("input", () => {
    BBUI.updateIndicators(state.branch, state.currentHead, false);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        await BBVCS.save(state, BBUI.getTextareaValue());
        BBUI.updateIndicators(state.branch, state.currentHead, true);
    }, 500);
});

// 監聽分支改名事件
window.addEventListener("blackboard:branchRename", async (e) => {
    const { branchId, newName } = e.detail;
    await BBCore.renameBranch(state.owner, branchId, newName);

    // 如果改名的是當前分支，更新 state
    if (branchId === state.branchId) {
        state.branch = newName;
        BBUI.updateIndicators(state.branch, state.currentHead, true);
    }

    BBMessage.info(`分支已更名為 "${newName}"`);
    await updateBranchList();
});

// 監聽清單更新事件
window.addEventListener("blackboard:listUpdated", () => {
    initAllInfiniteLists();
});

// 啟動黑板
initBoard();
