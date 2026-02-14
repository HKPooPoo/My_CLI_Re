import db, { Dexie } from "./indexedDB.js"
import { ToastMessager } from "./toast.js"

const toast = new ToastMessager()
const DRAFT_TIMESTAMP = Number.MAX_SAFE_INTEGER

/**
 * 取得香港時間戳記 (ISO 格式)
 * @param {Date|number|string} [dateInput] 可選的日期輸入
 * @returns {string} 格式化後的 HKT 時間字串
 */
function getHKTTimestamp(dateInput) {
    const now = dateInput ? new Date(dateInput) : new Date();
    const hktOffset = 8 * 60 * 60 * 1000;
    const hktTime = new Date(now.getTime() + hktOffset);
    return hktTime.toISOString().replace('Z', '+08:00');
}

// 初始化資料庫預設資料
db.on("populate", async () => {
    await db.blackboard.add({
        owner: "guest",
        branch: "master",
        timestamp: DRAFT_TIMESTAMP,
        text: "",
        bin: "",
        createdAt: getHKTTimestamp()
    });
});

// 狀態變數
let currentUserBranch = { owner: "guest", branch: "master" };
let currentHead = 0;
let maxSlot = 10;
let debounceTimer = null;

// DOM 元素
const $pushBtn = document.querySelector(".push-btn");
const $pullBtn = document.querySelector(".pull-btn");
const $branchNameIndicator = document.querySelector(".branch-name");
const $branchHeadIndicator = document.querySelector(".branch-head");
const $branchSavedIndicator = document.querySelector(".branch-is-saved");
const $blackboardTextarea = document.getElementById("log-textarea");
const $branchListContainer = document.querySelector('[data-page="blackboard-branch"] .vcs-list-container');
const $branchBtn = document.getElementById("branch-btn");
const $checkoutBtn = document.getElementById("checkout-btn");
const $dropBtn = document.getElementById("drop-btn");

/**
 * 初始化 Blackboard
 */
export async function initBoard() {
    // 從 localStorage 獲取當前使用者與分支
    if (!localStorage.getItem('currentUser')) {
        localStorage.setItem("currentUser", "guest");
        localStorage.setItem("currentBranch", "master");
    }

    currentUserBranch = {
        owner: localStorage.getItem("currentUser"),
        branch: localStorage.getItem("currentBranch") || "master"
    };

    currentHead = 0;

    // 載入初始內容
    await setTextarea(currentHead);
    updateIndicators();
    await updateBranchList();
}

// 綁定事件監聽器
$pushBtn.addEventListener("click", push);
$pullBtn.addEventListener("click", pull);
$branchBtn.addEventListener("click", createBranch);
$checkoutBtn.addEventListener("click", checkoutBranch);
$dropBtn.addEventListener("click", dropBranch);

$blackboardTextarea.addEventListener("input", () => {
    $branchSavedIndicator.textContent = "UNSAVED";
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(saveToDB, 500);
});

// 初始化執行
initBoard();

/**
 * 提交 (Push) 當前內容至歷史記錄
 */
async function push() {
    await saveToDB();
    clearTimeout(debounceTimer);

    if (!$blackboardTextarea.value.trim()) return;

    // 如果當前在歷史節點，則先回到最新狀態 (Head 0)
    if (currentHead > 0) {
        currentHead--;
        await setTextarea(currentHead);
        updateIndicators();
        return;
    }

    const textToPush = $blackboardTextarea.value.trim();

    // 1. 新增提交記錄
    await db.blackboard.add({
        ...currentUserBranch,
        timestamp: Date.now(),
        text: textToPush,
        bin: ""
    });

    // 2. 清空草稿 (DRAFT_TIMESTAMP 記錄)
    const draft = await db.blackboard.where('[owner+branch+timestamp]')
        .equals([currentUserBranch.owner, currentUserBranch.branch, DRAFT_TIMESTAMP])
        .first();

    if (draft) {
        draft.text = "";
        await db.blackboard.put(draft);
    } else {
        await db.blackboard.add({
            ...currentUserBranch,
            timestamp: DRAFT_TIMESTAMP,
            text: "",
            bin: "",
            createdAt: getHKTTimestamp()
        });
    }

    // 3. 整理舊記錄 (保留最新 maxSlot 個項)
    const collection = db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.minKey],
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.maxKey]
        );

    const count = await collection.count();
    if (count > maxSlot) {
        const keysToDelete = await collection.limit(count - maxSlot).primaryKeys();
        await db.blackboard.bulkDelete(keysToDelete);
    }

    $blackboardTextarea.value = "";
    updateIndicators();
    await updateBranchList();
}

/**
 * 拉回 (Pull) 較早的歷史記錄
 */
async function pull() {
    const count = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.minKey],
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.maxKey]
        )
        .count();

    if (currentHead < count - 1) {
        await saveToDB();
        clearTimeout(debounceTimer);
        currentHead++;
        await setTextarea(currentHead);
        updateIndicators();
    }
}

/**
 * 設定文字區塊內容
 */
async function setTextarea(index) {
    const entry = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.minKey],
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.maxKey]
        )
        .reverse()
        .offset(index)
        .first();

    $blackboardTextarea.value = entry?.text ?? "";
}

/**
 * 更新 UI 指示器
 */
function updateIndicators() {
    $branchNameIndicator.textContent = currentUserBranch.branch;
    $branchHeadIndicator.textContent = currentHead;
    $branchSavedIndicator.textContent = "SAVED";
}

/**
 * 自動儲存至資料庫草稿或當前節點
 */
async function saveToDB() {
    const textToSave = $blackboardTextarea.value;
    const targetHead = currentHead;

    const entry = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.minKey],
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.maxKey]
        )
        .reverse()
        .offset(targetHead)
        .first();

    if (entry) {
        if (entry.text !== textToSave) {
            await db.blackboard.update(entry.id, { text: textToSave });
        }
    } else if (targetHead === 0) {
        await db.blackboard.add({
            ...currentUserBranch,
            timestamp: DRAFT_TIMESTAMP,
            text: textToSave,
            bin: "",
            createdAt: getHKTTimestamp()
        });
    }

    if ($blackboardTextarea.value === textToSave) {
        $branchSavedIndicator.textContent = "SAVED";
    }
}

/**
 * 更新分支列表 UI
 */
export async function updateBranchList() {
    if (!$branchListContainer) return;

    const branches = new Map();

    // 獲取當前使用者的所有分支
    await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, Dexie.minKey, Dexie.minKey],
            [currentUserBranch.owner, Dexie.maxKey, Dexie.maxKey]
        )
        .reverse()
        .each(record => {
            let info = branches.get(record.branch);
            if (!info) {
                info = { owner: record.owner, draftRecord: null, earliestTimestamp: null };
                branches.set(record.branch, info);
            }

            if (record.timestamp === DRAFT_TIMESTAMP) {
                info.draftRecord = record;
            } else {
                info.earliestTimestamp = record.timestamp;
            }
        });

    $branchListContainer.innerHTML = "";

    for (const [branchName, info] of branches) {
        let displayTime = "unknown";
        let timestampToSave = null;

        if (info.draftRecord && info.draftRecord.createdAt) {
            displayTime = info.draftRecord.createdAt;
        } else {
            // 修復遺失的創建時間
            displayTime = getHKTTimestamp(info.earliestTimestamp);
            timestampToSave = displayTime;
        }

        if (timestampToSave && info.draftRecord) {
            await db.blackboard.update(info.draftRecord.id, { createdAt: timestampToSave });
            info.draftRecord.createdAt = timestampToSave;
        }

        const item = document.createElement("div");
        item.classList.add("vcs-list-item");
        item.dataset.branch = branchName;
        if (currentUserBranch.branch === branchName) {
            item.classList.add("active");
        }

        item.innerHTML = `
            <input type="text" class="vcs-list-branch" value="${branchName}" placeholder="分支名稱" name="vcs-list-branch" maxlength="32">
            <div class="vcs-list-timestamp">${displayTime}</div>
            <div class="vcs-list-owner">${info.owner}</div>
        `;

        const input = item.querySelector(".vcs-list-branch");

        input.addEventListener("change", async (e) => {
            const newName = e.target.value.trim();
            if (newName && newName !== branchName) {
                await renameBranch(branchName, newName);
            } else {
                e.target.value = branchName;
            }
        });

        $branchListContainer.appendChild(item);
    }

    // 觸發自定義事件或直接通知 VCS 更新 (如果需要)
    window.dispatchEvent(new CustomEvent("blackboard:listUpdated"));
}

/**
 * 切換分支
 */
async function switchBranch(branchName, skipSave = false) {
    if (currentUserBranch.branch === branchName) return;

    if (!skipSave) await saveToDB();

    currentUserBranch.branch = branchName;
    localStorage.setItem("currentBranch", branchName);

    currentHead = 0;
    await setTextarea(currentHead);
    updateIndicators();
    await updateBranchList();
}

/**
 * 分支重新命名
 */
async function renameBranch(oldName, newName) {
    if (oldName === newName) return;

    const existing = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, newName, Dexie.minKey],
            [currentUserBranch.owner, newName, Dexie.maxKey]
        ).count();

    if (existing > 0) {
        toast.addMessage(`System: 分支 "${newName}" 已經存在。`);
        await updateBranchList();
        return;
    }

    const records = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, oldName, Dexie.minKey],
            [currentUserBranch.owner, oldName, Dexie.maxKey]
        ).toArray();

    await db.transaction('rw', db.blackboard, async () => {
        for (const record of records) {
            await db.blackboard.update(record.id, { branch: newName });
        }
    });

    if (currentUserBranch.branch === oldName) {
        currentUserBranch.branch = newName;
        localStorage.setItem("currentBranch", newName);
        updateIndicators();
    }

    await updateBranchList();
}

/**
 * 創建新分支 (複製當前分支內容)
 */
async function createBranch() {
    const timestamp = getHKTTimestamp();
    const newBranchName = timestamp;

    const existing = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, newBranchName, Dexie.minKey],
            [currentUserBranch.owner, newBranchName, Dexie.maxKey]
        ).count();

    if (existing > 0) {
        toast.addMessage(`System: 分支 "${newBranchName}" 已經存在。`);
        await updateBranchList();
        return;
    }

    const records = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.minKey],
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.maxKey]
        ).toArray();

    await db.transaction('rw', db.blackboard, async () => {
        let currentDraftText = "";
        let currentDraftBin = "";

        for (const record of records) {
            if (record.timestamp === DRAFT_TIMESTAMP) {
                currentDraftText = record.text;
                currentDraftBin = record.bin;
                continue;
            }

            await db.blackboard.add({
                owner: record.owner,
                branch: newBranchName,
                timestamp: record.timestamp,
                text: record.text,
                bin: record.bin
            });
        }

        await db.blackboard.add({
            owner: currentUserBranch.owner,
            branch: newBranchName,
            timestamp: DRAFT_TIMESTAMP,
            text: currentDraftText,
            bin: currentDraftBin,
            createdAt: timestamp
        });
    });

    await updateBranchList();
}

/**
 * 切換至選中的分支 (Checkout)
 */
async function checkoutBranch() {
    const activeItem = $branchListContainer.querySelector(".vcs-list-item.active");
    if (!activeItem) return;

    const branchName = activeItem.dataset.branch;

    if (branchName) {
        await switchBranch(branchName);
    }
}

/**
 * 刪除或重置分支 (Drop)
 */
async function dropBranch() {
    const activeItem = $branchListContainer.querySelector(".vcs-list-item.active");
    if (!activeItem) return;

    const branchNameToDrop = activeItem.dataset.branch;
    const owner = currentUserBranch.owner;

    // 1. 獲取該分支的所有記錄
    const records = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [owner, branchNameToDrop, Dexie.minKey],
            [owner, branchNameToDrop, Dexie.maxKey]
        ).toArray();

    if (records.length === 0) return;

    // 2. 檢查是否有實質內容 (任何一筆記錄有文字)
    const hasContent = records.some(r => r.text.trim().length > 0);

    if (hasContent) {
        // --- 模式 A: Wipe (清空內容) ---
        await db.transaction('rw', db.blackboard, async () => {
            for (const record of records) {
                await db.blackboard.update(record.id, { text: "" });
            }
        });

        toast.addMessage(`System: 分支 "${branchNameToDrop}" 內容已清空。`);

        // 如果當前正在該分支，重新渲染文字區
        if (branchNameToDrop === currentUserBranch.branch) {
            currentHead = 0;
            await setTextarea(currentHead);
            updateIndicators();
        }
    } else {
        // --- 模式 B: Delete (刪除分支) ---
        // 先計算總共有多少分支
        const allBranches = new Set();
        await db.blackboard.where('[owner+branch+timestamp]')
            .between([owner, Dexie.minKey, Dexie.minKey], [owner, Dexie.maxKey, Dexie.maxKey])
            .each(record => allBranches.add(record.branch));

        const isLastBranch = allBranches.size <= 1;

        if (isLastBranch) {
            // 如果是最後一個分支，不要真的刪除，而是確保它是 master 且為空
            await db.transaction('rw', db.blackboard, async () => {
                await db.blackboard.where('[owner+branch+timestamp]')
                    .between([owner, branchNameToDrop, Dexie.minKey], [owner, branchNameToDrop, Dexie.maxKey])
                    .delete();

                await db.blackboard.add({
                    owner: owner,
                    branch: "master",
                    timestamp: DRAFT_TIMESTAMP,
                    text: "",
                    bin: "",
                    createdAt: getHKTTimestamp()
                });
            });

            currentUserBranch.branch = "master";
            localStorage.setItem("currentBranch", "master");
            toast.addMessage(`System: 刪除唯一分支，已重置為空 "master"。`);
        } else {
            // 還有其他分支，直接刪除
            await db.transaction('rw', db.blackboard, async () => {
                await db.blackboard.where('[owner+branch+timestamp]')
                    .between([owner, branchNameToDrop, Dexie.minKey], [owner, branchNameToDrop, Dexie.maxKey])
                    .delete();
            });

            toast.addMessage(`System: 分支 "${branchNameToDrop}" 已刪除。`);

            // 如果刪除的是當前分支，切換到 fallback
            if (branchNameToDrop === currentUserBranch.branch) {
                allBranches.delete(branchNameToDrop);
                const fallback = allBranches.has('master') ? 'master' : allBranches.values().next().value;
                await switchBranch(fallback, true);
            }
        }
    }

    await updateBranchList();
}
