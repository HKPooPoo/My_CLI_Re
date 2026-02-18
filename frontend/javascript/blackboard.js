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
import { playAudio } from "./audio.js";
import { EditorAttachments } from "./editor-attachments.js";

// --- 全域狀態聲明 ---
const state = {
    owner: "local",      // 當前編輯權限 (通常設為 local)
    branch: "",         // 當前分支名稱 (用於 UI 顯示)
    branchId: 0,        // 當前分支物理 ID
    currentHead: 0,     // 歷史深度指標 (0 表示最新)
    maxSlot: 10,        // 本地歷史保存上限
    isVirtual: false    // 是否處於「新頁面」的虛擬狀態 (尚未存入 DB)
};

let debounceTimer = null;
let isInitializing = false;

// --- File Attachment Instance ---
const bbAttach = EditorAttachments.create({
    dropZone: document.getElementById('bb-drop-zone'),
    fileInput: document.getElementById('bb-file-input'),
    chipsContainer: document.getElementById('bb-attachment-chips'),
    dropOverlay: document.getElementById('bb-drop-overlay'),
    onAttach: async (hash, meta) => {
        // Immediately persist the attachment to the current record
        const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        if (entry) {
            // [Meta]: Store full object in bin for offline hint
            const binData = { hash, ...meta };
            await db.blackboard.update([entry.owner, entry.branchId, entry.timestamp], { bin: binData });
        }
    },
    onDetach: async (hash) => {
        // Clear the bin reference from the current record
        const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        // Handle bin as object or string
        const currentHash = (entry && typeof entry.bin === 'object') ? entry.bin.hash : entry?.bin;
        
        if (entry && currentHash === hash) {
            await db.blackboard.update([entry.owner, entry.branchId, entry.timestamp], { bin: null });
        }
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
    } finally {
        isInitializing = false;
    }
}

/**
 * 同步畫面內容
 * 步驟：1. 從 Core 抓取當前 Head 對應的紀錄 2. 更新文字框 3. 更新 UI 指標
 */
async function syncView() {
    // [Fix]: 虛擬狀態處理 (New Page)
    if (state.isVirtual) {
        BBUI.setTextarea("");
        BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", "NEW", false);
        bbAttach?.clear();
        return;
    }

    const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
    BBUI.setTextarea(entry?.text ?? "");
    BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", state.currentHead, true);

    // Sync attachment chip display
    // Handle both string hash (legacy) and object meta (new)
    const binData = entry?.bin;
    const hash = (typeof binData === 'object') ? binData?.hash : binData;
    const hint = (typeof binData === 'object') ? binData : null;

    bbAttach?.setFromRecord(hash || null, hint);
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

    // [Fix]: 移除將當前分支強制置頂的排序邏輯，僅依時間排序
    combinedBranches.sort((a, b) => {
        return b.lastUpdate - a.lastUpdate;
    });

    // [Fix]: 嘗試保留當前選中的分支，若無 (首次加載) 則可考慮預設為當前分支
    const currentSelection = getSelectedBranchInfo();
    const targetSelectionId = currentSelection ? currentSelection.id : state.branchId;

    BBUI.renderBranchList(combinedBranches, targetSelectionId, state.owner, state.branchId);
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

                // [Fix]: Fork 後不自動切換，停留在當前分支
                // 僅更新列表以顯示新分支

                msg.update("FORK COMPLETE.");
                // await syncView(); // 不需要同步視圖，因為沒切換
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
                // [Fix]: 如果本地已存在，優先使用本地 (不強制同步)；僅在純雲端分支時才下載
                const targetOwner = selected.isLocal ? "local" : "remote";
                await BBVCS.checkout(state, selected.id, targetOwner);

                msg.update("BRANCH READY.");
                await syncView();
                // [Fix]: 切換後，列表選取狀態應跟隨切換到新分支 (可選，視 UX 需求而定，這裡保持自動更新)
                // 由於 updateBranchList 會抓取 DOM 選取狀態，這裡不需要額外操作，
                // 但為了讓使用者知道切換成功，清單刷新後選取項通常會停留在該分支上。
                await updateBranchList();
            } catch (e) {
                msg.close();
                BBMessage.error("LOAD FAILED.");
            }
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
        dropBtnEl.textContent = "N/A";
        dropBtnEl.disabled = true;
        currentDropAction = null;
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
        dropBtnEl.textContent = "CLEAN";
        currentDropAction = "clean";
    }
    // 2. Cloud (且無 Local Content 需清理) -> DROP
    else if (selected.isServer) {
        dropBtnEl.textContent = "DROP";
        currentDropAction = "drop";
    }
    // 3. Local (且無 Content, 無 Cloud) -> DELETE
    else if (selected.isLocal) {
        dropBtnEl.textContent = "DELETE";
        currentDropAction = "delete";
    } else {
        dropBtnEl.textContent = "N/A";
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

        try {
            if (currentDropAction === "clean") {
                BBMessage.info("CLEANING HISTORY...");
                await BBCore.clearBranchRecords("local", selected.id);
                // 若清理的是當前分支，需重置 Head
                if (selected.id === state.branchId) {
                    state.currentHead = 0;
                    await syncView();
                }
                BBMessage.success("HISTORY CLEARED");
            }
            else if (currentDropAction === "drop") {
                BBMessage.info("DROPPING FROM CLOUD...");
                await BlackboardService.deleteBranch(selected.id);
                BBMessage.success("CLOUD BRANCH DROPPED");
            }
            else if (currentDropAction === "delete") {
                BBMessage.info("DELETING LOCAL...");
                await BBCore.deleteLocalBranch("local", selected.id);

                if (selected.id === state.branchId) {
                    await initBoard();
                }
                BBMessage.success("LOCAL BRANCH DELETED");
            }

            // 操作完成後刷新列表與按鈕狀態
            await updateBranchList();
            await updateDropButtonState();
        } catch (e) {
            BBMessage.error("ACTION FAILED: " + e.message);
        }
    });
}

// 監聽選取變更與列表刷新
window.addEventListener("blackboard:selectionChanged", () => {
    // 防抖：避免快速滾動時頻繁查詢 DB
    if (dropButtonTimer) clearTimeout(dropButtonTimer);
    dropButtonTimer = setTimeout(updateDropButtonState, 100);
});

window.addEventListener("blackboard:listUpdated", () => {
    setTimeout(updateDropButtonState, 50);
});

// --- 事件監聽區 ---

// 自動儲存：監聽文字框輸入並防抖處理
BBUI.elements.textarea?.addEventListener("input", () => {
    // 立即更新為 UNSAVED，但不要觸發完整的 DOM 重繪
    if (BBUI.elements.savedStatus) BBUI.elements.savedStatus.textContent = "UNSAVED";

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        await BBVCS.save(state, BBUI.getTextareaValue());

        // [Fix]: 狀態更新後，依據是否仍為虛擬狀態顯示指標
        const headIndicator = state.isVirtual ? "NEW" : state.currentHead;
        BBUI.updateIndicators(state.branch || "NAMELESS_BRANCH", headIndicator, true);

        await updateBranchList(); // 立即更新清單同步狀態
    }, 200);
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
    // [Fix]: Check active page class instead of non-existent ID
    const activePage = document.querySelector(".page.active");
    const isBlackboardVisible = activePage && activePage.dataset.page && activePage.dataset.page.startsWith("blackboard-");

    if (document.visibilityState === 'visible' && isBlackboardVisible && loggedInUser && !isInitializing) {
        updateBranchList();
    }
}, 500);

/**
 * PWA Service Worker 註冊與更新邏輯
 */
let deferredPrompt;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('PWA: SW registered: ', registration);

            // 檢測是否有等待中的更新
            if (registration.waiting) {
                showUpdateToast(registration);
            }

            // 監聽新的更新發現
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateToast(registration);
                    }
                });
            });
        }).catch(err => {
            console.warn('PWA: Service Worker registration failed:', err);
        });

        // 監聽控制器變更 (刷新頁面)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    });
}

// 顯示更新提示 Toast
function showUpdateToast(registration) {
    const msg = BBMessage.info("NEW VERSION AVAILABLE.");
    // 這裡我們簡單地自動更新，或者您可以添加一個按鈕讓用戶點擊
    // 為了符合 "I want it to auto re-cache" 的開發者需求，我們自動 skipWaiting
    if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
}

// 安裝提示 (A2HS)
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // 顯示安裝按鈕 (例如在 Auth 頁面或 HUD)
    // 這裡我們先廣播一個事件，讓 UI 組件決定如何顯示
    window.dispatchEvent(new CustomEvent("pwa:installable"));
});

// 全域安裝函式
window.installPWA = async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`PWA: User response to install prompt: ${outcome}`);
        deferredPrompt = null;
    }
};
