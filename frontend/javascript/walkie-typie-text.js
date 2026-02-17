/**
 * Walkie-Typie Text - Twin Blackboard Controller
 * =================================================================
 * Responsibilities:
 * 1. Handle selection from list (load twin blackboards).
 * 2. Manage WE blackboard (editable, syncs to DB & Cloud).
 * 3. Manage THEY blackboard (read-only, real-time from WebSocket).
 * 4. Handle Switch button to toggle view positions.
 * 5. Lock textareas when no active connection.
 * 6. Display both side UIDs in titles.
 * 7. Reset THEY head on incoming updates (partner positions to edited page).
 * =================================================================
 * Dependencies: WTDb, WTVCS, WalkieTypieService (完全獨立於 Blackboard)
 * =================================================================
 */

import { WTDb } from "./walkie-typie-db.js";
import { WTVCS } from "./walkie-typie-vcs.js";
import { WalkieTypieService } from "./services/walkie-typie-service.js";

export const WTText = {
    elements: {
        container: document.querySelector(".page[data-page='walkie-typie-text']"),
        weTitle: document.querySelector(".walkie-typie-blackboard-we-title"),
        theyTitle: document.querySelector(".walkie-typie-blackboard-they-title"),
        weTextarea: document.getElementById("walkie-typie-we-blackboard"),
        theyTextarea: document.getElementById("walkie-typie-they-blackboard"),
        switchBtn: document.getElementById("walkie-typie-blackboard-feature-switch"),

        wePushBtn: document.querySelector(".we-push-btn"),
        wePullBtn: document.querySelector(".we-pull-btn"),
        theyPushBtn: document.querySelector(".they-push-btn"),
        theyPullBtn: document.querySelector(".they-pull-btn"),
    },

    currentConnection: null,
    isSwapped: false,
    saveTimer: null,
    commitTimer: null,

    // VCS States — no owner field (WT-specific)
    weState: { branchId: 0, branch: "WE", currentHead: 0, maxSlot: 10, isVirtual: false },
    theyState: { branchId: 0, branch: "THEY", currentHead: 0, maxSlot: 10, isVirtual: false },

    init() {
        this.bindEvents();
        this.lockBoards(); // #13: Lock on init — no active connection

        // Load swap preference
        const savedSwap = localStorage.getItem("wt_swap_pref");
        if (savedSwap === "true") {
            this.toggleSwap(true);
        }
    },

    bindEvents() {
        // Connection selected from list (500ms debounced)
        window.addEventListener("walkie-typie:selected", (e) => {
            this.loadConnection(e.detail);
        });

        // Connection deleted — lock and clear boards
        window.addEventListener("walkie-typie:disconnected", (e) => {
            // 清除所有 pending timers，避免 stale save/commit
            clearTimeout(this.saveTimer);
            clearTimeout(this.commitTimer);

            if (this.currentConnection &&
                this.currentConnection.partner_uid === e.detail.partnerUid) {
                this.currentConnection = null;
                this.lockBoards();
                this.clearBoards();
            }
        });

        // Switch button
        if (this.elements.switchBtn) {
            this.elements.switchBtn.addEventListener("click", () => {
                this.toggleSwap();
            });
        }

        // VCS Buttons — WE side (editable)
        this.elements.wePushBtn?.addEventListener("click", async () => {
            if (!this.currentConnection) return;
            await WTVCS.push(this.weState, this.elements.weTextarea.value, false);
            await this.refreshBoards();
        });
        this.elements.wePullBtn?.addEventListener("click", async () => {
            if (!this.currentConnection) return;
            await WTVCS.pull(this.weState, this.elements.weTextarea.value, false);
            await this.refreshBoards();
        });

        // VCS Buttons — THEY side (readOnly: no save, no virtual page)
        this.elements.theyPushBtn?.addEventListener("click", async () => {
            if (!this.currentConnection) return;
            await WTVCS.push(this.theyState, this.elements.theyTextarea.value, true);
            await this.refreshBoards();
        });
        this.elements.theyPullBtn?.addEventListener("click", async () => {
            if (!this.currentConnection) return;
            await WTVCS.pull(this.theyState, this.elements.theyTextarea.value, true);
            await this.refreshBoards();
        });

        // Real-time updates from partner (THEY side)
        window.addEventListener("walkie-typie:content-update", (e) => {
            if (!this.currentConnection) return;
            const { branchId, text, timestamp } = e.detail;

            if (String(branchId) === String(this.currentConnection.partner_branch_id)) {
                // #9: Reset THEY head to 0 — partner positions to edited page
                this.theyState.currentHead = 0;
                this.theyState.isVirtual = false;
                this.updateTheirBoard(text, timestamp);
            }
        });

        // WE input handler — mirrors blackboard's approach: WTVCS.save() + broadcast
        if (this.elements.weTextarea) {
            this.elements.weTextarea.addEventListener("input", this.handleMyInput.bind(this));
        }
    },

    /**
     * #13: Lock both textareas when no active connection
     */
    lockBoards() {
        if (this.elements.weTextarea) {
            this.elements.weTextarea.setAttribute("disabled", "true");
        }
        if (this.elements.theyTextarea) {
            this.elements.theyTextarea.setAttribute("disabled", "true");
        }
    },

    /**
     * Unlock boards: WE=editable, THEY=readonly
     */
    unlockBoards() {
        if (this.elements.weTextarea) {
            this.elements.weTextarea.removeAttribute("disabled");
        }
        if (this.elements.theyTextarea) {
            this.elements.theyTextarea.removeAttribute("disabled");
            this.elements.theyTextarea.setAttribute("readonly", "true");
        }
    },

    /**
     * Clear both textareas and reset titles
     */
    clearBoards() {
        if (this.elements.weTextarea) this.elements.weTextarea.value = "";
        if (this.elements.theyTextarea) this.elements.theyTextarea.value = "";
        if (this.elements.weTitle) this.elements.weTitle.textContent = "OUR BLACKBOARD";
        if (this.elements.theyTitle) this.elements.theyTitle.textContent = "THEIR BLACKBOARD";
    },

    toggleSwap(forceState = null) {
        this.isSwapped = forceState !== null ? forceState : !this.isSwapped;
        localStorage.setItem("wt_swap_pref", this.isSwapped);

        const container = this.elements.container;
        if (!container) return;

        if (this.isSwapped) {
            container.classList.add("swapped");
        } else {
            container.classList.remove("swapped");
        }
    },

    async loadConnection(connection) {
        // 先清除上一個 connection 的 pending timers
        clearTimeout(this.saveTimer);
        clearTimeout(this.commitTimer);

        this.currentConnection = connection;

        // Update State IDs
        this.weState.branchId = connection.my_branch_id;
        this.theyState.branchId = connection.partner_branch_id;

        // Reset Heads
        this.weState.currentHead = 0;
        this.theyState.currentHead = 0;
        this.weState.isVirtual = false;
        this.theyState.isVirtual = false;

        // #13: Unlock boards now that we have an active connection
        this.unlockBoards();

        try {
            // Sync THEY data from backend
            await this.syncPartnerBranch();
            await this.refreshBoards();
        } catch (err) {
            console.error("WTText: Load Failed", err);
        }
    },

    /**
     * Pull latest records for partner's branch from backend → save to IndexedDB
     */
    async syncPartnerBranch() {
        if (!this.currentConnection) return;

        const partnerBranchId = this.currentConnection.partner_branch_id;

        try {
            const data = await WalkieTypieService.fetchBoardRecords(partnerBranchId);

            if (data?.records?.length > 0) {
                // 清除舊的本地 THEY 快取
                await WTDb.deleteBranchRecords(partnerBranchId);

                // 匯入所有後端紀錄 (保留原始 timestamp 以保持歷史順序)
                for (const record of data.records) {
                    await WTDb.addRecordWithTimestamp(
                        partnerBranchId,
                        "THEY",
                        record.text || "",
                        parseInt(record.timestamp)
                    );
                }
            }
        } catch (e) {
            console.error("WTText: Sync Failed", e);
        }
    },

    async refreshBoards() {
        if (!this.currentConnection) return;

        // #8: Display both side UIDs
        const myUid = localStorage.getItem("currentUser") || "LOCAL";
        if (this.elements.weTitle) this.elements.weTitle.textContent = myUid.toUpperCase();

        const theyLabel = (this.currentConnection.partner_tag || this.currentConnection.partner_uid).toUpperCase();
        if (this.elements.theyTitle) this.elements.theyTitle.textContent = theyLabel;

        // Read WE content
        try {
            if (this.weState.isVirtual) {
                this.elements.weTextarea.value = "";
            } else {
                const myRecord = await WTDb.getRecord(this.weState.branchId, this.weState.currentHead);
                this.elements.weTextarea.value = myRecord ? myRecord.text : "";
            }
        } catch (err) {
            console.error("Error reading WE record:", err);
        }

        // Read THEY content (always read-only)
        try {
            const theirRecord = await WTDb.getRecord(this.theyState.branchId, this.theyState.currentHead);
            this.elements.theyTextarea.value = theirRecord ? theirRecord.text : "";
        } catch (err) {
            console.error("Error reading THEY record:", err);
        }
    },

    /**
     * WE input handler — mirrors blackboard approach:
     * 核心：呼叫 WTVCS.save() 更新現有紀錄，而非 WTDb.addRecord() 新增紀錄。
     * 這確保 Push/Pull 翻的是使用者自己建立的「頁面」，而非每次打字的快照。
     */
    handleMyInput(e) {
        if (!this.currentConnection) return;

        const text = e.target.value;

        // 200ms debounce — 與 blackboard 一致
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(async () => {
            // 使用 WTVCS.save() — 更新現有紀錄，不新增
            await WTVCS.save(this.weState, text);
            // 廣播給對方
            this.broadcastUpdate(text);
        }, 200);

        // 2s debounce — 後端持久化
        clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(async () => {
            try {
                if (!text || !text.trim()) return;
                await WalkieTypieService.commitBoard({
                    branchId: this.currentConnection.my_branch_id,
                    branchName: "WE",
                    records: [{ timestamp: Date.now(), text: text, bin: null }]
                });
            } catch (err) {
                console.error("WT: Cloud Save Failed", err);
            }
        }, 2000);
    },

    async broadcastUpdate(text) {
        if (!this.currentConnection) return;
        try {
            await WalkieTypieService.sendSignal({
                partner_uid: this.currentConnection.partner_uid,
                text: text,
                branch_id: this.currentConnection.partner_branch_id
            });
        } catch (e) {
            console.error("Signal failed", e);
        }
    },

    /**
     * 接收對方即時更新 — 更新而非新增 THEY 紀錄。
     * 核心：找到現有 Head 0 紀錄並更新，避免累積快照歷史。
     * 新的 THEY 頁面只在 syncPartnerBranch() 同步後端資料時產生。
     */
    async updateTheirBoard(text, timestamp) {
        if (!this.currentConnection) return;

        if (text !== null && text !== undefined) {
            // 直接顯示在 textarea
            this.elements.theyTextarea.value = text;

            const branchId = this.currentConnection.partner_branch_id;

            // 更新現有 Head 0 紀錄，而非新增
            const existing = await WTDb.getRecord(branchId, 0);
            if (existing) {
                await WTDb.updateText(branchId, existing.timestamp, text);
            } else {
                await WTDb.addRecord(branchId, "THEY", text);
            }
        } else {
            // No content in signal → fallback to sync
            await this.syncPartnerBranch();
            await this.refreshBoards();
        }
    }
};

// Init
WTText.init();
