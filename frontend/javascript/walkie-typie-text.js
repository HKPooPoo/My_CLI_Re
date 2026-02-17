/**
 * Walkie-Typie Text - Twin Blackboard Controller
 * =================================================================
 * Architecture (Server-Authoritative):
 *
 * WE 側 (editable):
 *   Input → 200ms → WTVCS.save() → IndexedDB (local cache)
 *         → 200ms → signal → Broadcast (no DB writes)
 *         → 2s   → commit → Postgres + last_signal update
 *   Push/Pull → IndexedDB
 *
 * THEY 側 (read-only):
 *   WebSocket → 直接顯示文字 (不存 IndexedDB)
 *   Push/Pull → theyRecords[] 記憶體陣列 (from Postgres API)
 *   loadConnection → API GET → theyRecords[]
 *   不可建新頁
 *
 * Dependencies: WTDb, WTVCS, WalkieTypieService
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
    signalTimer: null,
    commitTimer: null,

    // WE: IndexedDB-backed VCS state (same as Blackboard)
    weState: { branchId: 0, branch: "WE", currentHead: 0, maxSlot: 10, isVirtual: false },

    // THEY: Memory-based, server-authoritative
    theyState: { currentHead: 0 },
    theyRecords: [],     // Committed records from Postgres API (oldest→newest)
    theyLiveText: null,  // Latest text from WebSocket (null = no live update yet)

    init() {
        this.bindEvents();
        this.lockBoards();

        const savedSwap = localStorage.getItem("wt_swap_pref");
        if (savedSwap === "true") {
            this.toggleSwap(true);
        }
    },

    bindEvents() {
        // --- Connection Lifecycle ---

        window.addEventListener("walkie-typie:selected", (e) => {
            this.loadConnection(e.detail);
        });

        window.addEventListener("walkie-typie:disconnected", (e) => {
            clearTimeout(this.saveTimer);
            clearTimeout(this.signalTimer);
            clearTimeout(this.commitTimer);

            if (this.currentConnection &&
                this.currentConnection.partner_uid === e.detail.partnerUid) {
                this.currentConnection = null;
                this.theyRecords = [];
                this.theyLiveText = null;
                this.lockBoards();
                this.clearBoards();
            }
        });

        // --- Switch Button ---

        this.elements.switchBtn?.addEventListener("click", () => this.toggleSwap());

        // --- WE Push/Pull (IndexedDB, same as Blackboard) ---

        this.elements.wePushBtn?.addEventListener("click", async () => {
            if (!this.currentConnection) return;
            await WTVCS.push(this.weState, this.elements.weTextarea.value, false);
            this.refreshWE();
        });

        this.elements.wePullBtn?.addEventListener("click", async () => {
            if (!this.currentConnection) return;
            await WTVCS.pull(this.weState, this.elements.weTextarea.value, false);
            this.refreshWE();
        });

        // --- THEY Push/Pull (Memory array, read-only) ---

        this.elements.theyPushBtn?.addEventListener("click", () => {
            if (!this.currentConnection) return;
            if (this.theyState.currentHead > 0) {
                this.theyState.currentHead--;
                this.refreshTHEY();
            }
        });

        this.elements.theyPullBtn?.addEventListener("click", () => {
            if (!this.currentConnection) return;
            const maxHead = this.theyRecords.length - 1;
            if (this.theyState.currentHead < maxHead) {
                this.theyState.currentHead++;
                this.refreshTHEY();
            }
        });

        // --- Real-time Content from Partner (WebSocket) ---

        window.addEventListener("walkie-typie:content-update", (e) => {
            if (!this.currentConnection) return;
            const { branch_id, text } = e.detail;

            if (String(branch_id) === String(this.currentConnection.partner_branch_id)) {
                // Store live text + force Head 0 + direct display
                this.theyLiveText = text;
                this.theyState.currentHead = 0;
                this.elements.theyTextarea.value = text;
            }
        });

        // --- WE Input Handler ---

        this.elements.weTextarea?.addEventListener("input", this.handleMyInput.bind(this));
    },

    // =====================================================================
    //  BOARD LIFECYCLE
    // =====================================================================

    lockBoards() {
        this.elements.weTextarea?.setAttribute("disabled", "true");
        this.elements.theyTextarea?.setAttribute("disabled", "true");
    },

    unlockBoards() {
        this.elements.weTextarea?.removeAttribute("disabled");
        if (this.elements.theyTextarea) {
            this.elements.theyTextarea.removeAttribute("disabled");
            this.elements.theyTextarea.setAttribute("readonly", "true");
        }
    },

    clearBoards() {
        if (this.elements.weTextarea) this.elements.weTextarea.value = "";
        if (this.elements.theyTextarea) this.elements.theyTextarea.value = "";
        if (this.elements.weTitle) this.elements.weTitle.textContent = "OUR BLACKBOARD";
        if (this.elements.theyTitle) this.elements.theyTitle.textContent = "THEIR BLACKBOARD";
    },

    toggleSwap(forceState = null) {
        this.isSwapped = forceState !== null ? forceState : !this.isSwapped;
        localStorage.setItem("wt_swap_pref", this.isSwapped);
        if (this.elements.container) {
            this.elements.container.classList.toggle("swapped", this.isSwapped);
        }
    },

    // =====================================================================
    //  STEP 3: LOAD CONNECTION (Download both sides)
    // =====================================================================

    async loadConnection(connection) {
        // Clear pending operations from previous connection
        clearTimeout(this.saveTimer);
        clearTimeout(this.signalTimer);
        clearTimeout(this.commitTimer);

        this.currentConnection = connection;

        // Reset states
        this.weState.branchId = connection.my_branch_id;
        this.weState.currentHead = 0;
        this.weState.isVirtual = false;
        this.theyState.currentHead = 0;
        this.theyRecords = [];
        this.theyLiveText = null;

        this.unlockBoards();

        try {
            // Download BOTH sides from server
            await Promise.all([
                this.syncWE(),
                this.syncTHEY()
            ]);

            // STEP 4: Show twin blackboard content at Head 0
            this.refreshWE();
            this.refreshTHEY();
            this.refreshTitles();
        } catch (err) {
            console.error("WTText: Load Failed", err);
        }
    },

    /**
     * Sync WE side: Fetch my committed records from Postgres → merge into IndexedDB.
     * Purpose: Cross-device sync (if I committed from another device).
     */
    async syncWE() {
        if (!this.currentConnection) return;
        const branchId = this.currentConnection.my_branch_id;

        try {
            const data = await WalkieTypieService.fetchBoardRecords(branchId);
            if (data?.records?.length > 0) {
                // Server-authoritative: clear local + import server records
                await WTDb.deleteBranchRecords(branchId);
                for (const r of data.records) {
                    await WTDb.addRecordWithTimestamp(
                        branchId, "WE", r.text || "", parseInt(r.timestamp)
                    );
                }
            }
            // If no server records: keep whatever is in IndexedDB (first time use)
        } catch (e) {
            console.warn("WTText: WE Sync Failed (using local cache)", e);
        }
    },

    /**
     * Sync THEY side: Fetch partner's committed records from Postgres → memory array.
     * NO IndexedDB writes. Server is the sole truth for THEY data.
     */
    async syncTHEY() {
        if (!this.currentConnection) return;

        try {
            const data = await WalkieTypieService.fetchBoardRecords(
                this.currentConnection.partner_branch_id
            );
            // Records sorted oldest→newest from server (orderBy timestamp ASC)
            this.theyRecords = data?.records || [];
        } catch (e) {
            console.warn("WTText: THEY Sync Failed", e);
            this.theyRecords = [];
        }
    },

    // =====================================================================
    //  STEP 4: DISPLAY
    // =====================================================================

    /**
     * WE display: Read from IndexedDB (same as Blackboard)
     */
    async refreshWE() {
        if (!this.currentConnection) return;

        try {
            if (this.weState.isVirtual) {
                this.elements.weTextarea.value = "";
            } else {
                const record = await WTDb.getRecord(
                    this.weState.branchId,
                    this.weState.currentHead
                );
                this.elements.weTextarea.value = record?.text || "";
            }
        } catch (err) {
            console.error("WE read error:", err);
        }
    },

    /**
     * THEY display: Read from memory array or live WebSocket text.
     *
     * Head 0 = theyLiveText (if available) or theyRecords[last] (newest committed)
     * Head N = theyRecords[length - 1 - N] (committed history)
     */
    refreshTHEY() {
        if (!this.currentConnection) return;

        if (this.theyState.currentHead === 0) {
            // Head 0: show live text if available, else newest committed
            if (this.theyLiveText !== null) {
                this.elements.theyTextarea.value = this.theyLiveText;
            } else {
                const last = this.theyRecords[this.theyRecords.length - 1];
                this.elements.theyTextarea.value = last?.text || "";
            }
        } else {
            // Head N: committed history from theyRecords[]
            const idx = this.theyRecords.length - 1 - this.theyState.currentHead;
            this.elements.theyTextarea.value =
                (idx >= 0 && idx < this.theyRecords.length)
                    ? (this.theyRecords[idx].text || "")
                    : "";
        }
    },

    refreshTitles() {
        if (!this.currentConnection) return;
        const myUid = localStorage.getItem("currentUser") || "LOCAL";
        if (this.elements.weTitle) this.elements.weTitle.textContent = myUid.toUpperCase();

        const theyLabel = (this.currentConnection.partner_tag || this.currentConnection.partner_uid).toUpperCase();
        if (this.elements.theyTitle) this.elements.theyTitle.textContent = theyLabel;
    },

    // =====================================================================
    //  STEP 6: INPUT → SAVE → SIGNAL → COMMIT
    // =====================================================================

    /**
     * Mirrors Blackboard's input handler:
     * 200ms → WTVCS.save() (local) + signal (broadcast)
     * 2s → commit (Postgres + last_signal)
     */
    handleMyInput(e) {
        if (!this.currentConnection) return;
        const text = e.target.value;

        // 200ms: Local save (IndexedDB, same as Blackboard)
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(async () => {
            await WTVCS.save(this.weState, text);
        }, 200);

        // 200ms: Real-time signal to partner (lightweight broadcast, no DB)
        clearTimeout(this.signalTimer);
        this.signalTimer = setTimeout(() => {
            this.broadcastSignal(text);
        }, 200);

        // 2s: Persistent commit to Postgres (also updates last_signal)
        clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(() => {
            this.commitWE(text);
        }, 2000);
    },

    async broadcastSignal(text) {
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

    async commitWE(text) {
        if (!this.currentConnection || !text?.trim()) return;
        try {
            await WalkieTypieService.commitBoard({
                branchId: this.currentConnection.my_branch_id,
                branchName: "WE",
                records: [{ timestamp: Date.now(), text: text, bin: null }]
            });
        } catch (err) {
            console.error("WT: Commit Failed", err);
        }
    }
};

// Init
WTText.init();
