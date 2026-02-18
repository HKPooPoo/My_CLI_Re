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
import { WTCore } from "./walkie-typie-core.js";

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
    activeChannel: null, // The shared Echo channel instance
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

                // LEAVE CHANNEL
                if (this.activeChannel) {
                    const myUid = localStorage.getItem("currentUser");
                    const partnerUid = this.currentConnection.partner_uid;
                    const channelName = `walkie-typie.${[myUid, partnerUid].sort().join('.')}`;
                    if (WTCore.echo) {
                        WTCore.echo.leave(channelName);
                    }
                    this.activeChannel = null;
                }

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

        // --- Real-time Content from Partner (Backend Events - Fallback/Sync) ---

        window.addEventListener("walkie-typie:content-update", async (e) => {
            if (!this.currentConnection) return;
            const { branch_id, text } = e.detail;

            if (String(branch_id) === String(this.currentConnection.partner_branch_id)) {
                // Keep backend events for "commit" synchronization or signals not via whisper
                if (text === null || text === undefined) {
                    console.log("WT: Received Signal (Backend), Syncing...");
                    await this.syncTHEY();
                    this.refreshTHEY();
                }
                // Note: We prioritize Whisper for live typing, so we might ignore text here 
                // if we trust whisper, BUT backend events are more reliable for persistence.
                // Let's treat backend text updates as "authoritative" overwrites.
                else {
                    this.theyLiveText = text;
                    this.theyState.currentHead = 0;
                    this.elements.theyTextarea.value = text;
                    if (document.hidden) this.notify(this.currentConnection.partner_uid, text);
                }
            }
        });

        // --- WE Input Handler ---

        this.elements.weTextarea?.addEventListener("input", this.handleMyInput.bind(this));

        // Request notification permission on interaction
        this.elements.container?.addEventListener("click", () => this.tryRequestNotification(), { once: true });
    },

    // =====================================================================
    //  NOTIFICATIONS
    // =====================================================================

    tryRequestNotification() {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
    },

    notify(sender, text) {
        if ("Notification" in window && Notification.permission === "granted") {
            const title = `New message from ${sender}`;
            const options = {
                body: text ? (text.length > 50 ? text.substring(0, 50) + "..." : text) : "Content updated",
                icon: "/images/favicon.ico",
                tag: "wt-message" // Prevent stacking
            };
            new Notification(title, options);
        }
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

        // LEAVE OLD CHANNEL
        if (this.activeChannel) {
            const oldUid = this.currentConnection?.partner_uid;
            if (oldUid) {
                const myUid = localStorage.getItem("currentUser");
                const channelName = `walkie-typie.${[myUid, oldUid].sort().join('.')}`;
                WTCore.echo?.leave(channelName);
            }
            this.activeChannel = null;
        }

        this.currentConnection = connection;

        // JOIN NEW SHARED CHANNEL
        if (WTCore.echo) {
            const myUid = localStorage.getItem("currentUser");
            const partnerUid = connection.partner_uid;
            const channelName = `walkie-typie.${[myUid, partnerUid].sort().join('.')}`;

            console.log(`WT: Joining Shared Channel ${channelName}`);

            this.activeChannel = WTCore.echo.private(channelName);

            this.activeChannel.listenForWhisper('typing', (e) => {
                // Client Event received! Fast path.
                const { text } = e;
                this.theyLiveText = text;
                this.theyState.currentHead = 0;
                this.elements.theyTextarea.value = text;

                if (document.hidden) {
                    this.notify(partnerUid, text);
                }
            });
        }

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
                        branchId, "WE", r.text || "", parseInt(r.timestamp), r.bin || null
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

        let theyRecord = null;

        if (this.theyState.currentHead === 0) {
            // Head 0: show live text if available, else newest committed
            if (this.theyLiveText !== null) {
                this.elements.theyTextarea.value = this.theyLiveText;
                return;
            } else {
                theyRecord = this.theyRecords[this.theyRecords.length - 1];
                this.elements.theyTextarea.value = theyRecord?.text || "";
            }
        } else {
            // Head N: committed history from theyRecords[]
            const idx = this.theyRecords.length - 1 - this.theyState.currentHead;
            theyRecord = (idx >= 0 && idx < this.theyRecords.length)
                ? this.theyRecords[idx] : null;
            this.elements.theyTextarea.value = theyRecord?.text || "";
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
     * 200ms → WTVCS.save() (local) + signal (Whisper - instant)
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

        // 50ms: Whisper signal to partner (Client Event, bypassing API)
        // Reduced debounce for snappier feel
        clearTimeout(this.signalTimer);
        this.signalTimer = setTimeout(() => {
            this.broadcastSignal(text);
        }, 50);

        // 2s: Persistent commit to Postgres (also updates last_signal)
        clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(() => {
            this.commitWE(text);
        }, 2000);
    },

    async broadcastSignal(text) {
        if (!this.currentConnection || !this.activeChannel) return;

        // Use Client Event (Whisper)
        // This sends directly via WebSocket server, bypassing Laravel API
        try {
            this.activeChannel.whisper('typing', {
                text: text,
                branch_id: this.currentConnection.partner_branch_id // Include context if needed
            });
        } catch (e) {
            console.error("Whisper failed", e);
        }
    },

    async commitWE(text) {
        if (!this.currentConnection || !text?.trim()) return;
        try {
            // 先確保當前內容已存入 IndexedDB
            await WTVCS.save(this.weState, text);
            // 整批 commit（同 Blackboard 邏輯：從 IndexedDB 讀取全部 records 再上傳）
            await WTVCS.commit({
                branchId: this.currentConnection.my_branch_id,
                branch: "WE"
            });
        } catch (err) {
            console.error("WT: Commit Failed", err);
        }
    }
};

// Init
WTText.init();
