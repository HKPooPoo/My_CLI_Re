/**
 * Walkie-Typie Text - Twin Blackboard Controller
 * =================================================================
 * Architecture (Server-Authoritative):
 *
 * WE 側 (editable):
 *   Input → 50ms  → whisper signal → partner (Client Event, no DB)
 *         → 200ms → WTVCS.save() → IndexedDB (local cache)
 *         → 2s    → commit → Postgres + last_signal update
 *   Timers managed by TimerGroup (cancel on PUSH/PULL/auth/disconnect).
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
import { BBMessage } from "./blackboard-msg.js";
import { EditorAttachments } from "./editor-attachments.js";
import { extractHashes } from "./blackboard-core.js";
import db from "./indexedDB.js";
import { playAudio } from "./audio.js";
import { t } from './i18n.js';
import { T } from './timing.js';
import * as Settings from './settings.js';
import { TimerGroup } from './timer-group.js';
import * as CrossTabSync from './cross-tab-sync.js';
import { MultiStepButton } from './multiStepButton.js';
import { attachContentSearch } from './content-search.js';

// Single-slot "beep" state. First signal while the tab is backgrounded
// pushes a notification and locks the slot; further signals are
// silenced until the user returns to the tab (visibilitychange →
// visible). Walkie-talkie semantics: one call-tone per away session.
let _notificationStackActive = false;
if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
        if (!document.hidden) _notificationStackActive = false;
    });
}

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
        weDeleteBtn: document.getElementById("wt-delete-page-btn"),
    },

    currentConnection: null,
    activeChannel: null, // The shared Echo channel instance
    isSwapped: false,
    timers: new TimerGroup(),

    wtWeAttach: null,
    wtTheyAttach: null,

    currentBin: null,

    // WE: IndexedDB-backed VCS state (same as Blackboard). Tier 18 removed
    // maxSlot from state; WTVCS imports BOARD_MAX_SLOT directly.
    weState: { branchId: 0, branch: "WE", currentHead: 0, isVirtual: false },

    // THEY: Memory-based, server-authoritative
    theyState: { currentHead: 0 },
    theyRecords: [],     // Committed records from Postgres API (oldest→newest)
    theyLiveText: null,  // Latest text from WebSocket (null = no live update yet)
    theyLiveBin: null,   // Latest attachment from WebSocket

    init() {
        this.initAttachments();
        this.bindEvents();
        this.lockBoards();

        // Tier 24 — content search on BOTH WE and THEY side. WT has
        // no preview rail, so the pills overlay the textarea's
        // bottom-left (via `.editor-search--overlay`) inside each
        // side's editor-wrapper. The THEY wrapper (`#wt-they-drop-zone`)
        // was added in Tier 24's fine-tune pass to give the THEY
        // pill an anchoring parent.
        this._weSearch = attachContentSearch({
            root: document.getElementById('wt-drop-zone'),
            placement: 'overlay',
            getRecords: async () => {
                if (!this.currentConnection || this.weState.isVirtual) return [];
                // WTDb returns oldest→newest; search helper expects
                // newest-first so it aligns with how WT push/pull
                // traverses the same records (head 0 = newest).
                const records = await WTDb.getAllRecordsForBranch(this.weState.branchId);
                return [...records].sort((a, b) => b.timestamp - a.timestamp);
            },
            getCurrentHead: () => {
                if (!this.currentConnection || this.weState.isVirtual) return null;
                return this.weState.currentHead;
            },
            navigateTo: async (head) => {
                if (!this.currentConnection) return;
                // Flush pending debounced save first — matches the
                // flow of push/pull which also guarantees current
                // textarea content is persisted before moving head.
                const liveText = this.elements.weTextarea?.value ?? '';
                this.timers.cancel('save');
                await WTVCS.save(this.weState, liveText);
                this.weState.currentHead = head;
                this.weState.isVirtual = false;
                await this.refreshWE();
            },
        });

        // THEY side — read-only history; `theyRecords` is an in-memory
        // array loaded from the server (oldest → newest). The search
        // helper expects newest-first (head 0 = newest), so we flip
        // the order. NavigateTo sets `theyState.currentHead` and
        // refreshes; no save path on a read-only side.
        this._theySearch = attachContentSearch({
            root: document.getElementById('wt-they-drop-zone'),
            placement: 'overlay',
            getRecords: () => {
                if (!this.currentConnection) return [];
                // Reverse so index 0 = newest, aligning with
                // `theyState.currentHead` semantics used by push/pull.
                return [...this.theyRecords].reverse();
            },
            getCurrentHead: () => {
                if (!this.currentConnection) return null;
                return this.theyState.currentHead;
            },
            navigateTo: (head) => {
                if (!this.currentConnection) return;
                this.theyState.currentHead = head;
                this.refreshTHEY();
            },
        });
    },

    initAttachments() {
        // --- WE Side (Editable) ---
        this.wtWeAttach = EditorAttachments.create({
            dropZoneSelector: '#walkie-typie-we-blackboard',
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
                this.timers.cancel('save');
                this.timers.cancel('commit');

                const binData = { hash, ...meta };

                // 1. Ensure Record Exists (Handle Virtual State)
                // Multi-file: append binData to the record's file_hash array
                // instead of overwriting. Same pattern BB uses (see
                // blackboard.js onAttach). Without the append, every new
                // attach replaced the previous one and only the last
                // file survived a refresh.
                //
                // `currentBin` is also the live whisper payload — keep it
                // mirroring the record's `file_hash` shape (null / single
                // object / array) so the partner sees the FULL list of
                // attachments instantly. The earlier `this.currentBin =
                // binData` (single LAST) made the whisper sender drop
                // every prior file, so the opponent only ever saw one
                // chip until the 2 s commit + syncTHEY round-trip ran.
                let touchedTimestamp = null;
                if (this.weState.isVirtual) {
                    await WTDb.addRecord(
                        this.weState.branchId,
                        this.weState.branch,
                        this.elements.weTextarea.value || "",
                        binData
                    );
                    this.weState.isVirtual = false;
                    this.weState.currentHead = 0;
                    this.currentBin = binData;
                } else {
                    // Update Existing Record — append to file_hash array
                    const entry = await WTDb.getRecord(this.weState.branchId, this.weState.currentHead);
                    if (entry) {
                        const existing = entry.file_hash;
                        let fileHashes;
                        if (Array.isArray(existing)) {
                            fileHashes = [...existing, binData];
                        } else if (existing) {
                            fileHashes = [existing, binData];
                        } else {
                            fileHashes = [binData];
                        }
                        await WTDb.updateBin(entry.branch_id, entry.timestamp, fileHashes);
                        touchedTimestamp = entry.timestamp;
                        this.currentBin = fileHashes;
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
                        this.currentBin = binData;
                    }
                }

                // 2. Broadcast Signal
                this.broadcastSignal(this.elements.weTextarea.value);

                // NOTE: refreshWE() removed — it called setFromRecord() which cleared
                // the chip already rendered by handleFile() → _renderChip(). The chip
                // is correctly shown by EditorAttachments; no redundant refresh needed.

                // 3. Trigger Commit
                this.triggerCommit(this.elements.weTextarea.value);
                CrossTabSync.broadcast('wt:record:mutated', {
                    branchId: this.weState.branchId,
                    timestamp: touchedTimestamp
                });
            },
            onDetach: async (hash) => {
                if (!this.currentConnection) throw new Error("NO CONNECTION SELECTED");
                playAudio("Erase.mp3");

                // Multi-file: remove just THIS hash from the record's
                // file_hash array. Setting it to `null` was a single-file
                // assumption that wiped every other attached file along
                // with the one the user clicked × on.
                let touchedTimestamp = null;
                if (!this.weState.isVirtual) {
                    const entry = await WTDb.getRecord(this.weState.branchId, this.weState.currentHead);
                    if (entry) {
                        const existing = entry.file_hash;
                        const list = Array.isArray(existing)
                            ? existing
                            : (existing ? [existing] : []);
                        const remaining = list.filter(item => {
                            const h = (item && typeof item === 'object') ? item.hash : item;
                            return h !== hash;
                        });
                        const newValue = remaining.length === 0 ? null
                                        : remaining.length === 1 ? remaining[0]
                                        : remaining;
                        await WTDb.updateBin(entry.branch_id, entry.timestamp, newValue);
                        touchedTimestamp = entry.timestamp;

                        // Mirror the new file_hash shape on currentBin so
                        // the next whisper carries the FULL remaining
                        // list to the partner — not just the tail.
                        this.currentBin = newValue;
                    } else {
                        this.currentBin = null;
                    }
                } else {
                    this.currentBin = null;
                }

                // Broadcast Signal
                this.broadcastSignal(this.elements.weTextarea.value);

                // Trigger Commit
                this.triggerCommit(this.elements.weTextarea.value);
                CrossTabSync.broadcast('wt:record:mutated', {
                    branchId: this.weState.branchId,
                    timestamp: touchedTimestamp
                });
            },
            onRename: async (oldHash, newHash, meta) => {
                if (!this.currentConnection) return;
                const binData = { hash: newHash, ...meta };
                let touchedTimestamp = null;
                if (!this.weState.isVirtual) {
                    const entry = await WTDb.getRecord(this.weState.branchId, this.weState.currentHead);
                    if (entry) {
                        // Multi-file: find the matching hash in the array
                        // and replace just that entry. Single-file legacy
                        // path still works via the .length === 1 branch.
                        // `currentBin` mirrors the new file_hash shape so
                        // the live whisper carries the FULL list to the
                        // partner instead of just the renamed entry.
                        const existing = entry.file_hash;
                        const list = Array.isArray(existing)
                            ? existing
                            : (existing ? [existing] : []);
                        let changed = false;
                        const next = list.map(item => {
                            const h = (item && typeof item === 'object') ? item.hash : item;
                            if (h === oldHash) { changed = true; return binData; }
                            return item;
                        });
                        if (changed) {
                            const newValue = next.length === 1 ? next[0] : next;
                            await WTDb.updateBin(entry.branch_id, entry.timestamp, newValue);
                            touchedTimestamp = entry.timestamp;
                            this.currentBin = newValue;
                        }
                    }
                }
                this.broadcastSignal(this.elements.weTextarea.value);
                this.triggerCommit(this.elements.weTextarea.value);
                CrossTabSync.broadcast('wt:record:mutated', {
                    branchId: this.weState.branchId,
                    timestamp: touchedTimestamp
                });
            }
        });

        // --- THEY Side (ReadOnly) ---
        this.wtTheyAttach = EditorAttachments.create({
            chipsContainerSelector: '#wt-they-attachments',
            readOnly: true
        });
    },

    bindEvents() {
        // --- Cross-tab sync: another tab on this device mutated a WT
        //     record (rename, attach/detach, text save). Refresh our WE
        //     view if the change is for the connection we're viewing.
        CrossTabSync.on('wt:record:mutated', (detail) => {
            if (!detail || !this.currentConnection) return;
            if (detail.branchId !== this.weState.branchId) return;
            const isTyping = document.activeElement === this.elements.weTextarea;
            if (!isTyping) this.refreshWE();
        });

        // --- Auth Lifecycle: wipe all WT state on login/logout ---
        // WTCore.releaseEcho() already handles channel disconnection;
        // we just need to clear local state, timers, and boards.
        window.addEventListener("auth:updated", () => {
            // Best-effort flush: save current textarea before clearing
            const liveText = this.elements.weTextarea?.value;
            if (this.currentConnection && liveText !== undefined) {
                WTVCS.save(this.weState, liveText).catch(() => {});
            }

            this.timers.cancelAll();

            this.activeChannel = null;
            this.currentConnection = null;
            this.theyRecords = [];
            this.theyLiveText = null;
            this.theyLiveBin = null;
            this.currentBin = null;

            // Reset VCS state to prevent stale virtual flag on next login
            this.weState.isVirtual = false;
            this.weState.currentHead = 0;
            this.weState.branchId = 0;

            this.lockBoards();
            this.clearBoards();
        });

        // --- Connection Lifecycle ---

        window.addEventListener("walkie-typie:selected", (e) => {
            this.loadConnection(e.detail);
        });

        window.addEventListener("walkie-typie:disconnected", (e) => {
            this.timers.cancelAll();

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
            this.timers.cancelAll();
            playAudio("UIGeneralFocus.mp3");
            await WTVCS.push(this.weState, this.elements.weTextarea.value, false);
            this.refreshWE();
        });

        this.elements.wePullBtn?.addEventListener("click", async () => {
            if (!this.currentConnection) return;
            this.timers.cancelAll();
            playAudio("UIGeneralFocus.mp3");
            await WTVCS.pull(this.weState, this.elements.weTextarea.value, false);
            this.refreshWE();
        });

        // --- WE DELETE PAGE (destructive 3-step) ---
        if (this.elements.weDeleteBtn) {
            new MultiStepButton(this.elements.weDeleteBtn, {
                sound: "Click.mp3",
                steps: 1,
                action: async () => {
                    if (!this.currentConnection) return;
                    if (this.weState.isVirtual) {
                        BBMessage.info(t('common.deletePageFailed'));
                        return;
                    }
                    // Cancel pending save + commit BEFORE the delete: a queued
                    // commitWE(staleText) would otherwise run WTVCS.save(state,
                    // staleText) after our delete has shifted state.currentHead
                    // onto the older record, overwriting that record's text
                    // with the typed text from the deleted page. Same race
                    // onAttach already guards against above.
                    this.timers.cancel('save');
                    this.timers.cancel('commit');
                    try {
                        const entry = await WTDb.getRecord(this.weState.branchId, this.weState.currentHead);
                        if (!entry) return;
                        await db.walkie_typie.delete([entry.branch_id, entry.timestamp]);
                        const count = await WTDb.countRecords(this.weState.branchId);
                        if (count === 0) {
                            this.weState.isVirtual = true;
                            this.weState.currentHead = 0;
                        } else if (this.weState.currentHead >= count) {
                            this.weState.currentHead = count - 1;
                        }
                        await this.refreshWE();
                        BBMessage.info(t('common.pageDeleted'));
                    } catch (err) {
                        console.error('WT delete page failed:', err);
                        BBMessage.error(t('common.deletePageFailed'));
                    }
                }
            });
        }

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
                        if (document.hidden) this.notify(this.currentConnection.partner_uid, this.currentConnection.partner_tag);
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

    notify(senderUid, senderTag) {
        // Short-circuits, in order:
        //   1. user disabled notifications in WT config
        //   2. browser permission not granted
        //   3. tab is in the foreground — user is already here, no beep
        //   4. stack already locked — first sender keeps the slot until
        //      the user returns to the tab (walkie-talkie semantics)
        if (!Settings.get('wt', 'notifications')) return;
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        if (!document.hidden) return;
        if (_notificationStackActive) return;

        const sender = senderTag || senderUid;
        new Notification(t('walkieTypie.newSignal', { sender }));
        _notificationStackActive = true;
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
        // THEY stays disabled (set by lockBoards) — matches BC reader-mode
        // textarea behaviour. The previous readonly+remove-disabled trick let
        // users focus the field and see a blinking caret even though typing
        // is a no-op; users (correctly) flagged that as confusing.
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

    // Tier 22: MY SIDE FIRST setting retired. The in-session switch
    // button still flips board layout, but the preference is not
    // persisted — every navigation back to WT starts with the default
    // layout (contact on top). Session-only state lives on `isSwapped`.
    toggleSwap() {
        this.isSwapped = !this.isSwapped;
        if (this.elements.container) {
            this.elements.container.classList.toggle("swapped", this.isSwapped);
        }
    },

    // =====================================================================
    //  STEP 3: LOAD CONNECTION (Download both sides)
    // =====================================================================

    async loadConnection(connection) {
        // Lock textarea during connection transition to prevent input events
        // from rescheduling timers to the wrong connection during async gaps.
        this.elements.weTextarea?.setAttribute('disabled', 'true');

        // Capture live state synchronously BEFORE any await suspension point,
        // then cancel all timers atomically — prevents input events from
        // rescheduling timers between cancel and save.
        const hadConnection = !!this.currentConnection;
        const liveText = this.elements.weTextarea?.value;
        this.timers.cancelAll();

        // Save with the captured live value (NOT the timer's stale closure)
        if (hadConnection && liveText !== undefined) {
            await WTVCS.save(this.weState, liveText);
        }

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

                // Live Attachment Update — `bin` may be null, a single
                // object, or an array (multi-file whisper). Flatten via
                // extractHashes so the partner's chip rail reflects the
                // FULL list of attachments instantly, instead of waiting
                // for the 2 s commit + syncTHEY round-trip.
                const liveHashes = extractHashes(bin);
                if (liveHashes.length === 0) {
                    this.wtTheyAttach?.setFromRecord(null);
                } else if (liveHashes.length === 1 && bin && typeof bin === 'object' && !Array.isArray(bin)) {
                    this.wtTheyAttach?.setFromRecord(liveHashes[0], bin);
                } else {
                    this.wtTheyAttach?.setFromRecord(liveHashes);
                }

                if (document.hidden) {
                    this.notify(partnerUid, connection.partner_tag);
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
            BBMessage.error(t('walkieTypie.loadFailed'));
        }
    },

    /**
     * Helper: Reconstruct bin from backend flat structure. Returns
     *   null            (no files)
     *   {hash,...}      (single file — adds name/size/mime when r has them)
     *   [{hash},...]    (multi-file — bare hash objects; setFromRecord
     *                    lazy-fetches meta per chip)
     * Server may send file_hash as a JSON array string ('["h1","h2"]'),
     * a single hash string, or a single object — extractHashes
     * normalises all three.
     */
    reconstructBin(r) {
        const hashes = extractHashes(r.file_hash);
        if (hashes.length === 0) return null;
        if (hashes.length > 1) return hashes.map(h => ({ hash: h }));
        if (typeof r.file_hash === 'object' && !Array.isArray(r.file_hash)) return r.file_hash;
        return {
            hash: hashes[0],
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
                    branch_id: branchId,
                    branch: "WE",
                    text: r.text || "",
                    timestamp: parseInt(r.timestamp),
                    file_hash: this.reconstructBin(r)
                }));
                await db.walkie_typie.bulkPut(records);
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
                file_hash: this.reconstructBin(r)
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
                const before = this.elements.weTextarea?.value ?? '';
                const after = record?.text || '';
                const isFocused = document.activeElement === this.elements.weTextarea;
                if (before !== after) {
                    const b = before.slice(0, 30) + (before.length > 30 ? '…' : '');
                    const a = after.slice(0, 30) + (after.length > 30 ? '…' : '');
                    const level = isFocused ? 'warn' : 'log';
                    console[level](`[WT-SYNC] refreshWE OVERWRITE textarea: "${b}" → "${a}"${isFocused ? ' (user is typing!)' : ''}`);
                }
                this.elements.weTextarea.value = after;

                // Load Attachment(s) — record.file_hash may be:
                //   null              (no files)
                //   {hash, name, ...} (legacy single-file)
                //   [{hash,...}, ...] (multi-file)
                // setFromRecord accepts a string array, so flatten via
                // extractHashes. Hint is only useful for the single-file
                // case (lazy fetch covers multi-file cloud chips).
                const bin = record?.file_hash || null;
                const hashes = extractHashes(bin);
                // currentBin must mirror the record's file_hash shape
                // (null / single / array) — broadcastSignal reads it as
                // the live whisper payload. Collapsing it to the array's
                // last element here was the bug that made the partner see
                // only ONE chip after the next commit / refresh: that
                // refresh wiped currentBin from `[A, B]` down to `B`, and
                // the very next typing whisper carried a single object
                // again. Keep the full structure intact.
                this.currentBin = bin;
                if (hashes.length === 0) {
                    this.wtWeAttach?.setFromRecord(null);
                } else if (hashes.length === 1 && bin && typeof bin === 'object' && !Array.isArray(bin)) {
                    this.wtWeAttach?.setFromRecord(hashes[0], bin);
                } else {
                    this.wtWeAttach?.setFromRecord(hashes);
                }
            }
            // Keep search match-count fresh after any WE redraw.
            // No-op when the pill is collapsed.
            this._weSearch?.refresh();
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
            if (this.theyLiveText !== null) {
                this.elements.theyTextarea.value = this.theyLiveText;
                theyBin = this.theyLiveBin;
            } else {
                theyRecord = this.theyRecords[this.theyRecords.length - 1];
                this.elements.theyTextarea.value = theyRecord?.text || "";
                theyBin = theyRecord?.file_hash || null;
            }
        } else {
            const idx = this.theyRecords.length - 1 - this.theyState.currentHead;
            theyRecord = (idx >= 0 && idx < this.theyRecords.length)
                ? this.theyRecords[idx] : null;
            this.elements.theyTextarea.value = theyRecord?.text || "";
            theyBin = theyRecord?.file_hash || null;
        }

        // Render Attachment(s) — partner may have committed an array
        // (multi-file). Same flatten-via-extractHashes treatment as WE.
        const theyHashes = extractHashes(theyBin);
        if (theyHashes.length === 0) {
            this.wtTheyAttach?.setFromRecord(null);
        } else if (theyHashes.length === 1 && theyBin && typeof theyBin === 'object' && !Array.isArray(theyBin)) {
            this.wtTheyAttach?.setFromRecord(theyHashes[0], theyBin);
        } else {
            this.wtTheyAttach?.setFromRecord(theyHashes);
        }

        // Keep the THEY-side search match count fresh after any
        // refresh (new committed record from partner, live whisper,
        // head-navigate). No-op when the pill is collapsed.
        this._theySearch?.refresh();
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
     * Trigger a delayed commit (debounced). Logs the scheduled delay.
     */
    triggerCommit(text) {
        const delay = T('frontend.input.wtCommitDebounce');
        console.log(`[WT-SYNC] schedule commit in ${delay}ms`);
        this.timers.schedule('commit', () => this.commitWE(text), delay);
    },

    /**
     * Three-tier debounce pipeline:
     *   50ms  → whisper signal to partner (Client Event, no DB)
     *   200ms → WTVCS.save() to IndexedDB (local persistence)
     *   1s    → commitWE() to PostgreSQL (server persistence)
     */
    handleMyInput(e) {
        if (!this.currentConnection) return;
        const text = e.target.value;

        this.timers.schedule('save', async () => {
            await WTVCS.save(this.weState, text);
        }, T('frontend.input.wtSaveDebounce'));

        this.timers.schedule('signal', () => {
            this.broadcastSignal(text);
        }, T('frontend.input.wtWhisperDebounce'));

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

        const preview = (text ?? '').slice(0, 30);
        console.log(`[WT-SYNC] commit start — textarea snapshot: "${preview}${(text ?? '').length > 30 ? '…' : ''}"`);
        const commitStart = performance.now();
        try {
            // Ensure current content is saved to IndexedDB first
            await WTVCS.save(this.weState, text || "");
            // Batch commit (read all IndexedDB records → upload to server)
            await WTVCS.commit({
                branchId: this.currentConnection.my_branch_id,
                branch: "WE"
            });
            const elapsed = Math.round(performance.now() - commitStart);
            console.log(`[WT-SYNC] commit OK (${elapsed}ms)`);
            // Refresh WE display so attachment chip transitions LOCAL → SYNC
            await this.refreshWE();
        } catch (err) {
            // Silently ignore "empty board" — nothing to commit is not an error
            if (!err.message?.includes('EMPTY') && !err.message?.includes('NOT FOUND')) {
                const elapsed = Math.round(performance.now() - commitStart);
                console.warn(`[WT-SYNC] commit FAILED (${elapsed}ms):`, err.message);
                const isUserError = err.status >= 400 && err.status < 500;
                BBMessage.error(isUserError ? (err.message || t('walkieTypie.commitFailed')) : t('walkieTypie.commitFailed'));
            }
        }
    }
};

// Init
WTText.init();
