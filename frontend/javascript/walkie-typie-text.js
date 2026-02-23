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
import { EditorAttachments } from "./editor-attachments.js";
import db from "./indexedDB.js";
import { playAudio } from "./audio.js";
import { t } from './i18n.js';

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

    wtWeAttach: null,
    wtTheyAttach: null,

    currentBin: null,

    // WE: IndexedDB-backed VCS state (same as Blackboard)
    weState: { branchId: 0, branch: "WE", currentHead: 0, maxSlot: 10, isVirtual: false },

    // THEY: Memory-based, server-authoritative
    theyState: { currentHead: 0 },
    theyRecords: [],     // Committed records from Postgres API (oldest→newest)
    theyLiveText: null,  // Latest text from WebSocket (null = no live update yet)
    theyLiveBin: null,   // Latest attachment from WebSocket

    init() {
        this.initAttachments();
        this.bindEvents();
        this.lockBoards();

        const savedSwap = localStorage.getItem("wt_swap_pref");
        if (savedSwap === "true") {
            this.toggleSwap(true);
        }
    },

    initAttachments() {
        // --- WE Side (Editable) ---
        this.wtWeAttach = EditorAttachments.create({
            dropZoneSelector: '#wt-drop-zone',
            fileInputSelector: '#wt-file-input',
            chipsContainerSelector: '#wt-we-attachments',
            dropOverlaySelector: '#wt-drop-overlay',
            readOnly: false,
            onAttach: async (hash, meta) => {
                if (!this.currentConnection) throw new Error("NO CONNECTION SELECTED");
                playAudio("Cassette.mp3");

                // Cancel pending save/commit timers BEFORE the first await.
                //
                // If the user was typing just before dropping a file, two timers may
                // be queued as macrotasks:
                //
                //   saveTimer (200ms):  calls WTVCS.save() → WTDb.updateText()
                //     → deletes old record + creates new record with a new timestamp.
                //     If this fires between our WTDb.getRecord() and WTDb.updateBin()
                //     below, updateBin() targets the now-deleted old timestamp → silently
                //     fails → bin never saved → chip clears on next refreshWE().
                //
                //   commitTimer (2s):  calls commitWE() → refreshWE()
                //     → setFromRecord(null) → _clearChips(), erasing the chip.
                //
                // clearTimeout() is synchronous — it removes queued macrotasks before
                // any await suspension point, so both timers are guaranteed cancelled.
                // triggerCommit() at the end of onAttach reschedules the commit with
                // the correct, fully-persisted state.
                clearTimeout(this.saveTimer);
                clearTimeout(this.commitTimer);

                const binData = { hash, ...meta };
                this.currentBin = binData;

                // 1. Ensure Record Exists (Handle Virtual State)
                if (this.weState.isVirtual) {
                    await WTDb.addRecord(
                        this.weState.branchId,
                        this.weState.branch,
                        this.elements.weTextarea.value || "",
                        binData
                    );
                    this.weState.isVirtual = false;
                    this.weState.currentHead = 0;
                } else {
                    // Update Existing Record
                    const entry = await WTDb.getRecord(this.weState.branchId, this.weState.currentHead);
                    if (entry) {
                        await WTDb.updateBin(entry.branchId, entry.timestamp, binData);
                    } else if (this.weState.currentHead === 0) {
                        // Fresh board — no record exists yet (e.g. new connection, nothing typed).
                        // Create a record now so the attachment is persisted.
                        await WTDb.addRecord(
                            this.weState.branchId,
                            this.weState.branch,
                            this.elements.weTextarea.value || "",
                            binData
                        );
                        this.weState.isVirtual = false;
                        this.weState.currentHead = 0;
                    }
                }

                // 2. Broadcast Signal
                this.broadcastSignal(this.elements.weTextarea.value);

                // NOTE: refreshWE() removed — it called setFromRecord() which cleared
                // the chip already rendered by handleFile() → _renderChip(). The chip
                // is correctly shown by EditorAttachments; no redundant refresh needed.

                // 3. Trigger Commit
                this.triggerCommit(this.elements.weTextarea.value);
            },
            onDetach: async (hash) => {
                if (!this.currentConnection) throw new Error("NO CONNECTION SELECTED");
                playAudio("Erase.mp3");

                this.currentBin = null;

                // Remove bin from current record
                if (!this.weState.isVirtual) {
                    const entry = await WTDb.getRecord(this.weState.branchId, this.weState.currentHead);
                    if (entry) {
                        await WTDb.updateBin(entry.branchId, entry.timestamp, null);
                    }
                }

                // Broadcast Signal
                this.broadcastSignal(this.elements.weTextarea.value);

                // Trigger Commit
                this.triggerCommit(this.elements.weTextarea.value);
            }
        });

        // --- THEY Side (ReadOnly) ---
        this.wtTheyAttach = EditorAttachments.create({
            chipsContainerSelector: '#wt-they-attachments',
            readOnly: true
        });
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
                this.theyLiveBin = null;
                this.lockBoards();
                this.clearBoards();
            }
        });

        // --- Switch Button ---

        this.elements.switchBtn?.addEventListener("click", () => {
            playAudio("Click.mp3");
            this.toggleSwap();
        });

        // --- WE Push/Pull (IndexedDB, same as Blackboard) ---

        this.elements.wePushBtn?.addEventListener("click", async () => {
            if (!this.currentConnection) return;
            playAudio("UIGeneralFocus.mp3");
            await WTVCS.push(this.weState, this.elements.weTextarea.value, false);
            this.refreshWE();
        });

        this.elements.wePullBtn?.addEventListener("click", async () => {
            if (!this.currentConnection) return;
            playAudio("UIGeneralFocus.mp3");
            await WTVCS.pull(this.weState, this.elements.weTextarea.value, false);
            this.refreshWE();
        });

        // --- THEY Push/Pull (Memory array, read-only) ---

        this.elements.theyPushBtn?.addEventListener("click", () => {
            if (!this.currentConnection) return;
            playAudio("UIGeneralFocus.mp3");
            if (this.theyState.currentHead > 0) {
                this.theyState.currentHead--;
                this.refreshTHEY();
            }
        });

        this.elements.theyPullBtn?.addEventListener("click", () => {
            if (!this.currentConnection) return;
            playAudio("UIGeneralFocus.mp3");
            const maxHead = this.theyRecords.length - 1;
            if (this.theyState.currentHead < maxHead) {
                this.theyState.currentHead++;
                this.refreshTHEY();
            }
        });

        // --- Real-time Content from Partner (Backend Events - Committed Sync) ---

        window.addEventListener("walkie-typie:content-update", async (e) => {
            if (!this.currentConnection) return;
            const { branch_id, text } = e.detail;

            if (String(branch_id) === String(this.currentConnection.partner_branch_id)) {
                if (text === null || text === undefined) {
                    // Signal-only event: full re-sync needed
                    await this.syncTHEY();
                    this.refreshTHEY();
                } else {
                    // Committed text: update live state without disrupting history browsing.
                    // If user is at head 0, show the new text. If browsing history, leave them.
                    this.theyLiveText = text;
                    if (this.theyState.currentHead === 0) {
                        this.elements.theyTextarea.value = text;
                        if (document.hidden) this.notify(this.currentConnection.partner_uid, text);
                    }
                    // Silently refresh theyRecords[] in background for accurate history
                    this.syncTHEY();
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
            const title = t('walkieTypie.newMessage', { sender });
            const options = {
                body: text ? (text.length > 50 ? text.substring(0, 50) + "..." : text) : t('walkieTypie.contentUpdated'),
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
        if (this.elements.weTitle) this.elements.weTitle.textContent = t('walkieTypie.weBoard');
        if (this.elements.theyTitle) this.elements.theyTitle.textContent = t('walkieTypie.theyBoard');
        
        this.wtWeAttach?.setFromRecord(null);
        this.wtTheyAttach?.setFromRecord(null);
        this.currentBin = null;
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
        // Flush any pending WE save before switching (prevents uncommitted content loss)
        if (this.currentConnection && this.elements.weTextarea) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
            await WTVCS.save(this.weState, this.elements.weTextarea.value);
        }

        // Clear pending signals and commits from previous connection
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
                // Self-echo guard: Reverb should not send client events back to sender,
                // but guard defensively in case of unexpected behaviour.
                if (e.from === myUid) return;

                const { text, bin } = e;
                this.theyLiveText = text;
                this.theyLiveBin = bin;
                this.theyState.currentHead = 0;
                this.elements.theyTextarea.value = text;

                // Live Attachment Update
                this.wtTheyAttach?.setFromRecord(bin?.hash, bin);

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
        this.theyLiveBin = null;

        this.unlockBoards();
        playAudio("UISelectOn.mp3");

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
     * Helper: Reconstruct bin object from backend flat structure
     */
    reconstructBin(r) {
        if (!r.bin) return null;
        // If r.bin is already an object (local check), return it
        if (typeof r.bin === 'object') return r.bin;

        // Otherwise, it's a hash string, and metadata is in r (from join)
        return {
            hash: r.bin,
            name: r.file_name || 'unknown',
            size: r.file_size || 0,
            mime: r.file_mime || 'application/octet-stream'
        };
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
                // Non-destructive: upsert server records by [branchId+timestamp] key.
                // Local uncommitted records (different timestamps) are preserved.
                const records = data.records.map(r => ({
                    branchId,
                    branch: "WE",
                    text: r.text || "",
                    timestamp: parseInt(r.timestamp),
                    bin: this.reconstructBin(r)
                }));
                await db.walkieTypie.bulkPut(records);
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
            // Transform bin data
            this.theyRecords = (data?.records || []).map(r => ({
                ...r,
                bin: this.reconstructBin(r)
            }));
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
        // console.log("WTText: refreshWE called");
        if (!this.currentConnection) return;

        try {
            if (this.weState.isVirtual) {
                this.elements.weTextarea.value = "";
                this.currentBin = null;
                this.wtWeAttach?.setFromRecord(null);
            } else {
                const record = await WTDb.getRecord(
                    this.weState.branchId,
                    this.weState.currentHead
                );
                this.elements.weTextarea.value = record?.text || "";
                
                // Load Attachment
                const bin = record?.bin || null;
                this.currentBin = bin;
                this.wtWeAttach?.setFromRecord(bin?.hash, bin);
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
        let theyBin = null;

        if (this.theyState.currentHead === 0) {
            // Head 0: show live text if available, else newest committed
            if (this.theyLiveText !== null) {
                this.elements.theyTextarea.value = this.theyLiveText;
                theyBin = this.theyLiveBin;
            } else {
                theyRecord = this.theyRecords[this.theyRecords.length - 1];
                this.elements.theyTextarea.value = theyRecord?.text || "";
                theyBin = theyRecord?.bin || null;
            }
        } else {
            // Head N: committed history from theyRecords[]
            const idx = this.theyRecords.length - 1 - this.theyState.currentHead;
            theyRecord = (idx >= 0 && idx < this.theyRecords.length)
                ? this.theyRecords[idx] : null;
            this.elements.theyTextarea.value = theyRecord?.text || "";
            theyBin = theyRecord?.bin || null;
        }

        // Render Attachment
        this.wtTheyAttach?.setFromRecord(theyBin?.hash, theyBin);
    },

    refreshTitles() {
        if (!this.currentConnection) return;
        const myUid = localStorage.getItem("currentUser") || t('common.local');
        if (this.elements.weTitle) this.elements.weTitle.textContent = myUid.toUpperCase();

        const theyLabel = (this.currentConnection.partner_tag || this.currentConnection.partner_uid).toUpperCase();
        if (this.elements.theyTitle) this.elements.theyTitle.textContent = theyLabel;
    },

    // =====================================================================
    //  STEP 6: INPUT → SAVE → SIGNAL → COMMIT
    // =====================================================================

    /**
     * Trigger a delayed commit (debounced).
     */
    triggerCommit(text) {
        clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(() => {
            this.commitWE(text);
        }, 2000);
    },

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

        // 2s: Persistent commit
        this.triggerCommit(text);
    },

    async broadcastSignal(text) {
        if (!this.currentConnection || !this.activeChannel) return;

        try {
            this.activeChannel.whisper('typing', {
                from: localStorage.getItem("currentUser"), // for self-echo guard on receiver
                text: text,
                bin: this.currentBin
            });
        } catch (e) {
            console.error("Whisper failed", e);
        }
    },

    async commitWE(text) {
        // Allow commit if text exists OR bin exists
        const hasContent = (text && text.trim()) || this.currentBin;
        if (!this.currentConnection || !hasContent) return;

        try {
            // Ensure current content is saved to IndexedDB first
            await WTVCS.save(this.weState, text || "");
            // Batch commit (read all IndexedDB records → upload to server)
            await WTVCS.commit({
                branchId: this.currentConnection.my_branch_id,
                branch: "WE"
            });
            // Refresh WE display so attachment chip transitions LOCAL → SYNC
            await this.refreshWE();
        } catch (err) {
            // Silently ignore "empty board" — nothing to commit is not an error
            if (!err.message?.includes('EMPTY') && !err.message?.includes('NOT FOUND')) {
                console.error("WT: Commit Failed", err);
            }
        }
    }
};

// Init
WTText.init();
