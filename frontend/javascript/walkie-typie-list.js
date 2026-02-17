/**
 * Walkie-Typie List - Connection List Controller
 * =================================================================
 * Responsibilities:
 * 1. Render connection list (ordered by last_signal DESC).
 * 2. InfiniteList cursor picker (identical mechanics to branch list).
 * 3. ADD button: create new connection by UID.
 * 4. CUT button: delete selected connection + wipe all data.
 * 5. 500ms debounce on cursor change before dispatching selection.
 * 6. Tag renaming (nickname).
 * 7. Initial cursor at top.
 * =================================================================
 * Dependencies: WalkieTypieService, WTDb, InfiniteList, MultiStepButton, BBMessage
 * =================================================================
 */

import { WalkieTypieService } from "./services/walkie-typie-service.js";
import { WTDb, getHKTTimestamp } from "./walkie-typie-db.js";
import { InfiniteList } from "./blackboard-ui-list.js";
import { MultiStepButton } from "./multiStepButton.js";
import { BBMessage } from "./blackboard-msg.js";

export const WTList = {
    elements: {
        container: document.querySelector(".walkie-typie-list-list-container"),
        uidInput: document.getElementById("walkie-typie-add-uid"),
        addBtn: document.getElementById("walkie-typie-add-btn"),
        cutBtn: document.getElementById("walkie-typie-cut-btn"),
    },

    connections: [],
    infiniteList: null,
    selectionTimer: null,
    selectedConnection: null,

    init() {
        this.bindEvents();
        this.fetchConnections();
    },

    bindEvents() {
        // ADD Button — MultiStepButton: [click -> show SURE? -> click again -> execute]
        if (this.elements.addBtn) {
            new MultiStepButton(this.elements.addBtn, [
                { label: "ADD", sound: "UIGeneralFocus.mp3", action: () => { } },
                {
                    label: "SURE?",
                    sound: "UIGeneralOK.mp3",
                    action: async () => {
                        const uid = this.elements.uidInput?.value?.trim();
                        if (!uid) {
                            BBMessage.error("UID REQUIRED");
                            return;
                        }

                        try {
                            BBMessage.info("CONNECTING...");
                            const result = await WalkieTypieService.createConnection({ uid });
                            if (result.connection) {
                                this.handleUpdate(result.connection);
                                this.elements.uidInput.value = "";
                                BBMessage.success("CONNECTED");
                            }
                        } catch (e) {
                            BBMessage.error("CONNECT FAILED: " + (e.message || "UNKNOWN"));
                        }
                    }
                }
            ]);
        }

        // CUT Button — MultiStepButton: delete selected connection
        if (this.elements.cutBtn) {
            new MultiStepButton(this.elements.cutBtn, [
                { label: "CUT", sound: "UIGeneralFocus.mp3", action: () => { } },
                {
                    label: "SURE?",
                    sound: "UIGeneralCancel.mp3",
                    action: async () => {
                        if (!this.selectedConnection) {
                            BBMessage.error("NO TARGET SELECTED");
                            return;
                        }

                        const partnerUid = this.selectedConnection.partner_uid;
                        const myBranchId = this.selectedConnection.my_branch_id;
                        const partnerBranchId = this.selectedConnection.partner_branch_id;

                        try {
                            BBMessage.info("CUTTING...");

                            await WalkieTypieService.deleteConnection(partnerUid);

                            // Wipe local IndexedDB
                            await WTDb.deleteBranchRecords(myBranchId);
                            await WTDb.deleteBranchRecords(partnerBranchId);

                            // Remove from array
                            const index = this.connections.findIndex(c => c.partner_uid === partnerUid);
                            if (index !== -1) this.connections.splice(index, 1);

                            // Dispatch disconnection event
                            window.dispatchEvent(new CustomEvent("walkie-typie:disconnected", {
                                detail: { partnerUid }
                            }));

                            this.selectedConnection = null;
                            this.render();
                            BBMessage.success("CONNECTION SEVERED");
                        } catch (e) {
                            BBMessage.error("CUT FAILED: " + (e.message || "UNKNOWN"));
                        }
                    }
                }
            ]);
        }

        // Listen for real-time connection updates (from WebSocket)
        window.addEventListener("walkie-typie:connection-update", (e) => {
            const newConn = e.detail;
            if (newConn.deleted) {
                this.handleDelete(newConn.partner_uid);
            } else {
                this.handleUpdate(newConn);
            }
        });

        // Listen for InfiniteList cursor changes → 500ms debounce
        // Filter: ONLY process events from WT list container
        window.addEventListener("blackboard:selectionChanged", (e) => {
            const { item } = e.detail;
            if (!item || !this.elements.container || !this.elements.container.contains(item)) return;

            const partnerUid = item.dataset.partnerUid;
            const conn = this.connections.find(c => c.partner_uid === partnerUid);

            if (conn) {
                this.selectedConnection = conn;

                // 500ms debounce before dispatching to text page
                clearTimeout(this.selectionTimer);
                this.selectionTimer = setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("walkie-typie:selected", {
                        detail: conn
                    }));
                }, 500);
            }
        });

        // Window Focus → re-fetch connections (partner may have added us)
        window.addEventListener("focus", () => {
            this.fetchConnections();
        });
    },

    async fetchConnections() {
        try {
            const data = await WalkieTypieService.getConnections();
            if (data?.connections) {
                this.connections = data.connections;
                this.connections.sort((a, b) => b.last_signal - a.last_signal);
                this.render();
            }
        } catch (e) {
            // Silent on auth errors — user might not be logged in
            console.warn("WTList: Fetch Failed", e);
        }
    },

    handleUpdate(newConn) {
        const index = this.connections.findIndex(c => c.partner_uid === newConn.partner_uid);
        if (index !== -1) {
            this.connections[index] = { ...this.connections[index], ...newConn };
        } else {
            this.connections.push(newConn);
        }

        this.connections.sort((a, b) => b.last_signal - a.last_signal);
        this.render();
    },

    handleDelete(partnerUid) {
        const index = this.connections.findIndex(c => c.partner_uid === partnerUid);
        if (index !== -1) {
            const conn = this.connections[index];
            this.connections.splice(index, 1);

            WTDb.deleteBranchRecords(conn.my_branch_id);
            WTDb.deleteBranchRecords(conn.partner_branch_id);

            window.dispatchEvent(new CustomEvent("walkie-typie:disconnected", {
                detail: { partnerUid }
            }));

            this.selectedConnection = null;
            this.render();
        }
    },

    render() {
        if (!this.elements.container) return;

        this.elements.container.innerHTML = "";

        this.connections.forEach(conn => {
            const item = document.createElement("div");
            item.classList.add("walkie-typie-list-list-item");
            item.dataset.partnerUid = conn.partner_uid;

            // Tag input (nickname)
            const tagInput = document.createElement("input");
            tagInput.type = "text";
            tagInput.classList.add("walkie-typie-list-tag");
            tagInput.placeholder = "Name this guy...";
            tagInput.name = "walkie-typie-list-tag";
            tagInput.value = conn.partner_tag || "";

            tagInput.addEventListener("change", async (e) => {
                const newTag = e.target.value.trim();
                try {
                    await WalkieTypieService.updateConnectionTag(conn.partner_uid, { tag: newTag });
                    conn.partner_tag = newTag;
                } catch (err) {
                    BBMessage.error("TAG UPDATE FAILED");
                }
            });

            // Prevent InfiniteList from capturing input events
            tagInput.addEventListener("click", (e) => e.stopPropagation());
            tagInput.addEventListener("keydown", (e) => e.stopPropagation());

            // Last Signal
            const lastSignal = document.createElement("div");
            lastSignal.classList.add("walkie-typie-list-last-signal");
            lastSignal.textContent = conn.last_signal ? getHKTTimestamp(conn.last_signal) : "---";

            // UID
            const uid = document.createElement("div");
            uid.classList.add("walkie-typie-list-uid");
            uid.textContent = conn.partner_uid;

            item.appendChild(tagInput);
            item.appendChild(lastSignal);
            item.appendChild(uid);
            this.elements.container.appendChild(item);
        });

        // Initialize / Refresh InfiniteList — cursor at top (index 0)
        if (this.infiniteList) {
            this.infiniteList.refresh();
        } else if (this.connections.length > 0) {
            this.infiniteList = new InfiniteList(
                this.elements.container,
                ".walkie-typie-list-list-item"
            );
        }
    }
};

// Init
WTList.init();
