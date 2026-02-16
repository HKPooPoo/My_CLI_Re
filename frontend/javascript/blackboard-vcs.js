import { BBCore } from "./blackboard-core.js";
import { BBMessage } from "./blackboard-msg.js";
import db from "./indexedDB.js";
import { BlackboardService } from "./services/blackboard-service.js";

/**
 * Blackboard 版本控制邏輯層 (大腦)
 */
export const BBVCS = {
    /**
     * 執行推播 (向上翻頁或回到前端)
     */
    async push(state, currentText) {
        // [Fix]: 虛擬狀態下不允許再次 Push (避免無限疊加空白頁)
        if (state.isVirtual) {
            return false;
        }

        // [Fix]: 若當前頁面為空白 (且不是虛擬頁)，直接視為無效操作，除非它本來就是 Head 0 的有效空白頁?
        // 不，如果我在 Head 0 且它是空的，再 push 會怎樣? 
        // 應該允許 Push 到 Virtual 狀態，即使當前頁是空的 (因為 Virtual 狀態是為了輸入新內容)
        // 但為了避免資料庫累積空白頁，我們先 Save
        await this.save(state, currentText);

        // 數據清洗
        await BBCore.scrubBranch(state.owner, state.branchId, state.maxSlot);

        // 1. 如果在歷史頁面，則往回跳一頁 (回到較新紀錄)
        if (state.currentHead > 0) {
            state.currentHead--;
            return true;
        }

        // 2. 如果在 Head 0 (且已存檔)，則進入虛擬新頁面模式
        // 不直接寫入 DB，而是標記狀態，等待用戶輸入
        state.isVirtual = true;
        return true;
    },

    /**
     * 執行拉回 (向後翻閱歷史)
     */
    async pull(state, currentText) {
        // [Fix]: 如果在虛擬新頁面，Pull 等於「取消新建」，直接回到 Head 0
        if (state.isVirtual) {
            state.isVirtual = false;
            // 這裡不需要 save，因為虛擬頁面的內容若未存檔則視為丟棄
            // 若用戶已輸入內容，auto-save 會觸發 save 並解除 isVirtual，所以這裡只會處理「未輸入」或「剛輸入還沒存」的情況
            // 為了保險，如果 currentText 有內容，我們先存檔 (這會讓它變成真實 Head 0)，然後再執行 Pull
            if (currentText && currentText.trim()) {
                await this.save(state, currentText); // 這會解除 isVirtual
                // 存檔後，現在是真實 Head 0，接著繼續執行標準 Pull 邏輯 (翻到 Head 1)
            } else {
                return true; // 純粹取消，回到 Head 0
            }
        }

        // 標準 Pull 邏輯
        // 1. 先儲存當前狀態
        await this.save(state, currentText);

        // 2. 數據清洗
        await BBCore.scrubBranch(state.owner, state.branchId, state.maxSlot);

        // 3. 重新計算紀錄數量
        const count = await BBCore.countRecords(state.owner, state.branchId);

        // [Fix]: 若 Head 0 是空白，先刪除它 (防止歷史夾雜空白)
        // 注意：save() 已經會更新 DB，scrubBranch() 會刪除空白。
        // 所以如果現在 Head 0 還是空白，表示它被 scrub 刪掉了，或者根本沒存進去
        // 我們檢查 count。如果 count 變少了，currentHead 可能需要調整

        // 正常拉回：往舊歷史移動
        if (state.currentHead < count - 1) {
            state.currentHead++;
            return true;
        }

        return false;
    },

    /**
     * 自動儲存：更新現有歷史點或新增初始點
     */
    async save(state, text) {
        // [Fix]: 虛擬頁面存檔邏輯
        if (state.isVirtual) {
            // 只有當有內容時才真正建立紀錄
            if (text && text.trim()) {
                // 新增紀錄到 DB (這會成為新的 Head 0)
                await BBCore.addRecord(state.owner, state.branchId, state.branch, text);
                
                // 解除虛擬狀態
                state.isVirtual = false;
                state.currentHead = 0;

                // 執行溢出清理 (這時才會刪除最舊的紀錄)
                await BBCore.cleanupOldRecords(state.owner, state.branchId, state.maxSlot);
            }
            return;
        }

        // 標準存檔邏輯
        const entry = await BBCore.getRecord(state.owner, state.branchId, state.currentHead);
        
        if (entry) {
            if (entry.text !== text) {
                // 如果我們修改的是歷史節點 (Head > 0)
                if (state.currentHead > 0) {
                    // 檢查當前的 Head 0 是否為空，是的話就刪掉它避免廢頁
                    const head0 = await BBCore.getRecord(state.owner, state.branchId, 0);
                    if (head0 && (!head0.text || head0.text.trim() === "")) {
                        await db.blackboard.delete([head0.owner, head0.branchId, head0.timestamp]);
                    }
                }

                // 更新現有紀錄
                await BBCore.updateText(state.owner, state.branchId, entry.timestamp, text);
                state.currentHead = 0; // 編輯後置頂
            }
        } else if (state.currentHead === 0) {
            // 初始狀態 (無紀錄時)
            if (text && text.trim()) {
                await BBCore.addRecord("local", state.branchId, state.branch, text);
            }
        }
    },

    /**
     * Commit: 將指定分支的所有本地歷史上傳至 Server
     */
    async commit(branchMeta) {
        const { branchId, branch } = branchMeta;

        const loggedInUser = localStorage.getItem("currentUser");
        if (!loggedInUser) throw new Error("LOGIN REQUIRED FOR COMMIT.");

        // 0. Commit 前執行數據清洗 (移除空值與溢出)
        // 嘗試從環境中取得 maxSlot，若無則預設 10
        const maxSlot = parseInt(localStorage.getItem("blackboard_max_slot")) || 10;
        await BBCore.scrubBranch("local", branchId, maxSlot);

        // 1. 抓取該分支的所有紀錄
        let records = await BBCore.getAllRecordsForBranch("local", branchId);

        // [Fix]: 再次過濾空白紀錄，確保不提交空資料
        records = records.filter(r => r.text && r.text.trim() !== "");

        if (records.length === 0) {
            throw new Error("LOCAL DATA NOT FOUND OR EMPTY. CHECKOUT FIRST.");
        }

        // 2. 上傳至伺服器
        try {
            await BlackboardService.commit({
                branchId: branchId,
                branchName: branch,
                records: records
            });

            // Commit 成功後，將本地紀錄標記為 Synced 狀態
            // 這樣登出時 wipeSyncedData 就會將其抹除
            const syncedOwner = `local, online/${loggedInUser} [synced]`;
            await db.blackboard.where('owner').equals('local')
                .and(item => item.branchId === branchId)
                .modify({ owner: syncedOwner });

            return true;
        } catch (e) {
            throw new Error(e.message || "UPLOAD FAILED.");
        }
    },

    /**
     * Checkout: 切換分支，若為雲端分支則強制從雲端抓取最新紀錄並合併至本地
     */
    async checkout(state, targetBranchId, targetOwner) {
        // 1. 如果目標是雲端分支，不論本地有無資料都先進行同步 (確保最新)
        if (targetOwner !== "local") {
            BBMessage.info("SYNCING BRANCH DATA FROM CLOUD...");
            
            try {
                const data = await BlackboardService.fetchBranchDetails(targetBranchId);

                // 獲取當前 UID
                const currentUser = localStorage.getItem("currentUser") || "unknown";
                
                // 轉換格式並存入本地，使用特殊 owner 標籤以支援登出抹除
                // 格式：local, online/uid [synced]
                const downloadRecords = data.records.map(r => ({
                    owner: `local, online/${r.owner} [synced]`, 
                    branchId: parseInt(r.branch_id),
                    branch: r.branch_name,
                    timestamp: parseInt(r.timestamp),
                    text: r.text,
                    bin: r.bin
                }));

                // 使用 bulkPut 強制覆蓋本地舊有的同 ID/timestamp 紀錄
                await db.blackboard.bulkPut(downloadRecords);

                // 同步後執行數據清洗
                await BBCore.scrubBranch("local", targetBranchId, state.maxSlot || 10);
            } catch (e) {
                console.warn("CLOUD SYNC FAILED. USING LOCAL CACHE.", e);
            }
        }

        // 2. 更新 state (編輯區永遠是 local)
        state.branchId = targetBranchId;
        state.owner = "local";
        state.currentHead = 0;

        // 嘗試更新 branchName (從剛同步完的 local 抓取最新一筆)
        const latest = await BBCore.getRecord("local", targetBranchId, 0);
        state.branch = latest?.branch ?? "";

        localStorage.setItem("currentBranchId", state.branchId);
        return true;
    }
};
