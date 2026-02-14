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
    currentHead: 0,
    maxSlot: 10
};

let debounceTimer = null;

/**
 * 黑板初始化入口
 */
export async function initBoard() {
    // 讀取 Session 狀態
    state.owner = localStorage.getItem("currentUser") || "guest";
    state.branch = localStorage.getItem("currentBranch") || "master";
    state.currentHead = 0;

    // 載入當前 Head 內容
    await syncView();
    await updateBranchList();
}

/**
 * 更新並顯示分支清單
 */
async function updateBranchList() {
    const branches = await BBCore.getAllBranches(state.owner);
    BBUI.renderBranchList(branches, state.branch);
}

/**
 * 將資料庫內容同步至 UI
 */
async function syncView() {
    const entry = await BBCore.getRecord(state.owner, state.branch, state.currentHead);
    BBUI.setTextarea(entry?.text ?? "");
    BBUI.updateIndicators(state.branch, state.currentHead, true);
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
    if (updated) await syncView();
});

// 模擬輸入自動儲存
BBUI.elements.textarea?.addEventListener("input", () => {
    BBUI.updateIndicators(state.branch, state.currentHead, false);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        await BBVCS.save(state, BBUI.getTextareaValue());
        BBUI.updateIndicators(state.branch, state.currentHead, true);
    }, 500);
});

// 監聽清單更新事件，初始化 InfiniteList 捲動功能
window.addEventListener("blackboard:listUpdated", () => {
    initAllInfiniteLists();
});

// 初始化資料庫預設資料
db.on("populate", async () => {
    await BBCore.addEmptyRecord("guest", "master");
});

// 啟動黑板
initBoard();
