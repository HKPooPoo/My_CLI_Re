import { BBCore } from "./blackboard-core.js";
import { BBVCS } from "./blackboard-vcs.js";
import { BBUI } from "./blackboard-ui.js";
import { BBMessage } from "./blackboard-msg.js";
import { initAllInfiniteLists } from "./blackboard-ui-list.js"
import db from "./indexedDB.js"

// 初始化全域狀態
const state = {
    owner: "guest", // 依照要求，黑板系統主要操作 guest 資料
    branch: "",
    branchId: 0,
    currentHead: 0,
    maxSlot: 10
};

let debounceTimer = null;

/**
 * 黑板初始化入口
 */
export async function initBoard() {
    // 雖然 auth 模組會改 currentUser，但黑板分支預設均歸屬 guest
    state.owner = "guest";

    // 獲取 guest 的全部分支
    const branches = await BBCore.getAllBranches(state.owner);

    if (branches.length > 0) {
        const lastBranchId = parseInt(localStorage.getItem("currentBranchId"));
        const activeBranch = branches.find(b => b.id === lastBranchId) || branches[0];

        state.branchId = activeBranch.id;
        state.branch = activeBranch.name;
    } else {
        // 完全沒有分支時，建立一個初始空白分支 (guest:master)
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
    BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
}

/**
 * 更新並顯示分支清單
 */
async function updateBranchList() {
    const branches = await BBCore.getAllBranches(state.owner);
    BBUI.renderBranchList(branches, state.branchId);
}

// 綁定按鈕事件

// PUSH
BBUI.elements.pushBtn?.addEventListener("click", async () => {
    const updated = await BBVCS.push(state, BBUI.getTextareaValue());
    if (updated) {
        await syncView();
        await updateBranchList();
    }
});

// PULL
BBUI.elements.pullBtn?.addEventListener("click", async () => {
    const updated = await BBVCS.pull(state, BBUI.getTextareaValue());
    if (updated) {
        await syncView();
        await updateBranchList();
    }
});

// BRANCH (建立新分支)
BBUI.elements.branchBtn?.addEventListener("click", async () => {
    // 1. 儲存當前內容
    await BBVCS.save(state, BBUI.getTextareaValue());

    // 2. 建立新分支：固定 owner 為 guest，名字為空，ID 為現在時間
    const newId = Date.now();
    await BBCore.addRecord("guest", newId, "");

    // 3. 自動切換到新分支
    state.branchId = newId;
    state.branch = "";
    state.currentHead = 0;

    localStorage.setItem("currentBranchId", state.branchId);
    BBMessage.info("已建立新分支");

    await syncView();
    await updateBranchList();
});

// 監聽文字框輸入
BBUI.elements.textarea?.addEventListener("input", () => {
    BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, false);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        await BBVCS.save(state, BBUI.getTextareaValue());
        BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
    }, 500);
});

// 監聽分支改名事件
window.addEventListener("blackboard:branchRename", async (e) => {
    const { branchId, newName } = e.detail;
    await BBCore.renameBranch("guest", branchId, newName);

    if (branchId === state.branchId) {
        state.branch = newName;
        BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
    }

    BBMessage.info(`分支已更名為 "${newName || '(Empty)'}"`);
    await updateBranchList();
});

window.addEventListener("blackboard:listUpdated", () => {
    initAllInfiniteLists();
});

// 啟動黑板
initBoard();
