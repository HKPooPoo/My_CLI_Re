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

async function updateBranchList() {
    // 1. 抓取本地 (IndexedDB) 所有分支 (鎖定 local 分區)
    const localBranches = await BBCore.getAllBranches("local");
    const loggedInUser = localStorage.getItem("currentUser");

    const branchMap = new Map();

    // 先填入本地資料
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

    // 2. 如果登入，抓取伺服器清單並合併至 Map
    if (loggedInUser) {
        try {
            const res = await fetch('/api/blackboard/branches', { credentials: 'include' });
            const data = await res.json();

            data.branches.forEach(sb => {
                const sid = parseInt(sb.branch_id);
                const existing = branchMap.get(sid);

                if (existing) {
                    // 同 ID 存在於本地與雲端：合併顯示
                    existing.isServer = true;
                    existing.owner = sb.owner; // 儲存 uid 用於 UI 顯示 online/uid
                    // 根據最後更新時間判定是否同步
                    existing.isDirty = (parseInt(sb.last_update) !== existing.lastUpdate);
                } else {
                    // 僅存於雲端
                    branchMap.set(sid, {
                        id: sid,
                        name: sb.branch_name,
                        owner: sb.owner,
                        lastUpdate: parseInt(sb.last_update),
                        displayTime: getHKTTimestamp(sid),
                        isLocal: false,
                        isServer: true,
                        isDirty: true // 同步後的「僅雲端」被視為需要 pull/checkout 的 asynced 狀態
                    });
                }
            });
        } catch (e) {
            console.error("無法載入雲端分支", e);
        }
    }

    // 3. 排序：當前分支置頂，其餘依時間排序
    const combinedBranches = Array.from(branchMap.values());
    combinedBranches.sort((a, b) => {
        const aIsActive = a.id === state.branchId;
        const bIsActive = b.id === state.branchId;
        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;
        return b.lastUpdate - a.lastUpdate;
    });

    // 4. 渲染
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

// FORK (建立並繼承分支)
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

// CHECKOUT (切換分支)
BBUI.elements.checkoutBtn?.addEventListener("click", async () => {
    const activeItem = document.querySelector(".vcs-list-item.active");
    if (!activeItem) return;

    const targetId = parseInt(activeItem.dataset.branchId);
    const targetOwner = activeItem.querySelector(".vcs-list-owner").textContent.includes("online/")
        ? "remote" : "local"; // 簡單識別是否含雲端

    try {
        await BBVCS.checkout(state, targetId, targetOwner);
        BBMessage.info("已切換分支");
        await syncView();
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
