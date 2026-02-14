import { BBCore, getHKTTimestamp } from "./blackboard-core.js";
import { BBVCS } from "./blackboard-vcs.js";
import { BBUI } from "./blackboard-ui.js";
import { BBMessage } from "./blackboard-msg.js";
import { initAllInfiniteLists } from "./blackboard-ui-list.js"
import db, { Dexie } from "./indexedDB.js"

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

        // 如果目前登入，owner 指向該 UID，否則指向 local
        state.owner = loggedInUser && loggedInUser !== "" ? loggedInUser : "local";

        // 檢查表格是否完全為空 (包含 local 與任何紀錄)
        const totalCount = await db.blackboard.count();

        if (totalCount === 0) {
            // 全空狀態：執行首次訪問初始化 (建立 master 分支於 local)
            const newId = Date.now();
            await BBCore.addRecord("local", newId, "master");
            state.branchId = newId;
            state.branch = "master";
            state.owner = "local";
        } else {
            // 非空狀態：優先抓取目前 owner 的分支，若無則降級為 local
            let branches = await BBCore.getAllBranches(state.owner);
            if (branches.length === 0 && state.owner !== "local") {
                state.owner = "local";
                branches = await BBCore.getAllBranches("local");
            }

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
 * 將資料庫內容同步至 UI
 */
async function syncView() {
    const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
    BBUI.setTextarea(entry?.text ?? "");
    BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
}

/**
 * 更新並顯示分支清單 (整合 Local 與 Server)
 */
async function updateBranchList() {
    // 1. 抓取本地 (IndexedDB) 的所有分支 (不分 owner)
    const localBranches = await BBCore.getAllBranches("local");
    const loggedInUser = localStorage.getItem("currentUser");

    let combinedBranches = [...localBranches];

    // 2. 如果登入，抓取伺服器 (Postgres) 的清單
    if (loggedInUser) {
        try {
            const res = await fetch('/api/blackboard/branches', {
                credentials: 'include'
            });
            const data = await res.json();

            const serverBranches = data.branches.map(b => ({
                id: parseInt(b.branch_id),
                name: b.branch_name,
                owner: b.owner,
                lastUpdate: b.last_update,
                displayTime: getHKTTimestamp(parseInt(b.branch_id)),
                isServer: true
            }));

            combinedBranches = [...combinedBranches, ...serverBranches];
        } catch (e) {
            console.error("無法載入雲端分支", e);
        }
    }

    combinedBranches.sort((a, b) => b.lastUpdate - a.lastUpdate);
    BBUI.renderBranchList(combinedBranches, state.branchId, state.owner);
}

// 綁定按鈕事件

// PUSH / PULL
BBUI.elements.pushBtn?.addEventListener("click", async () => {
    const updated = await BBVCS.push(state, BBUI.getTextareaValue());
    if (updated) { await syncView(); await updateBranchList(); }
});

BBUI.elements.pullBtn?.addEventListener("click", async () => {
    const updated = await BBVCS.pull(state, BBUI.getTextareaValue());
    if (updated) { await syncView(); await updateBranchList(); }
});

// BRANCH (建立新分支)
BBUI.elements.branchBtn?.addEventListener("click", async () => {
    await BBVCS.save(state, BBUI.getTextareaValue());
    const newId = Date.now();
    await BBCore.addRecord("local", newId, "");
    state.branchId = newId;
    state.branch = "";
    state.owner = "local";
    state.currentHead = 0;
    localStorage.setItem("currentBranchId", state.branchId);
    BBMessage.info("已建立新分支 (Local)");
    await syncView();
    await updateBranchList();
});

// COMMIT (Local -> Server)
BBUI.elements.commitBtn?.addEventListener("click", async () => {
    try {
        await BBVCS.commit(state, BBUI.getTextareaValue());
        BBMessage.info("Commit 成功，已同步至雲端");
        await updateBranchList();
    } catch (e) {
        BBMessage.error(e.message);
    }
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

// 監聽分之改名
window.addEventListener("blackboard:branchRename", async (e) => {
    const { branchId, newName } = e.detail;
    await BBCore.renameBranch("local", branchId, newName);

    if (branchId === state.branchId && state.owner === "local") {
        state.branch = newName;
        BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);
    }

    BBMessage.info(`本地分支已更名`);
    await updateBranchList();
});

// 監聽帳戶狀態改變
window.addEventListener("blackboard:authUpdated", async () => {
    await initBoard();
});

window.addEventListener("blackboard:listUpdated", () => {
    // 使用 setTimeout 確保在 DOM 更新任務循環完成後再進行項目抓取
    setTimeout(() => {
        initAllInfiniteLists();
    }, 10);
});

// 啟動黑板
initBoard();
