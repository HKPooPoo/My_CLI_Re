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
 * Dependencies: WalkieTypieService, WTDb, InfiniteList, MultiStepButton
 * =================================================================
 */

import { WalkieTypieService } from "./services/walkie-typie-service.js";
import { WTDb, getHKTTimestamp } from "./walkie-typie-db.js";
import { InfiniteList } from "./blackboard-ui-list.js";
import { MultiStepButton } from "./multiStepButton.js";

export const WTList = {
    elements: {
        container: document.querySelector(".walkie-typie-list-list-container"),
        uidInput: document.getElementById("walkie-typie-add-uid"),
        addBtn: document.getElementById("walkie-typie-add-btn"),
        cutBtn: document.getElementById("walkie-typie-cut-btn"),
    },

    connections: [],
    infiniteList: null,
    selectionTimer: null,  // 500ms debounce timer
    selectedConnection: null, // Current cursor-pointed connection

    init() {
        this.bindEvents();
        this.fetchConnections();
    },

    bindEvents() {
        // ADD Button — MultiStepButton confirmation
        if (this.elements.addBtn) {
            new MultiStepButton(this.elements.addBtn, {
                onConfirm: async () => {
                    const uid = this.elements.uidInput?.value?.trim();
                    if (!uid) return;

                    try {
                        const result = await WalkieTypieService.createConnection({ uid });
                        if (result.connection) {
                            this.handleUpdate(result.connection);
                            this.elements.uidInput.value = "";
                        }
                    } catch (e) {
                        console.error("WTList: Add Failed", e);
                    }
                }
            });
        }

        // CUT Button — MultiStepButton confirmation, delete selected connection
        if (this.elements.cutBtn) {
            new MultiStepButton(this.elements.cutBtn, {
                onConfirm: async () => {
                    if (!this.selectedConnection) {
                        console.warn("WTList: No connection selected for CUT");
                        return;
                    }

                    const partnerUid = this.selectedConnection.partner_uid;
                    const myBranchId = this.selectedConnection.my_branch_id;
                    const partnerBranchId = this.selectedConnection.partner_branch_id;

                    try {
                        // 1. API DELETE
                        await WalkieTypieService.deleteConnection(partnerUid);

                        // 2. Wipe local IndexedDB data for both branches
                        await WTDb.deleteBranchRecords(myBranchId);
                        await WTDb.deleteBranchRecords(partnerBranchId);

                        // 3. Remove from local array
                        const index = this.connections.findIndex(c => c.partner_uid === partnerUid);
                        if (index !== -1) {
                            this.connections.splice(index, 1);
                        }

                        // 4. Dispatch disconnection event
                        window.dispatchEvent(new CustomEvent("walkie-typie:disconnected", {
                            detail: { partnerUid }
                        }));

                        // 5. Re-render
                        this.selectedConnection = null;
                        this.render();

                        console.log(`WTList: Connection to ${partnerUid} deleted.`);
                    } catch (e) {
                        console.error("WTList: CUT Failed", e);
                    }
                }
            });
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
        window.addEventListener("blackboard:selectionChanged", (e) => {
            const { item } = e.detail;
            if (!item || !this.elements.container.contains(item)) return;

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
            console.error("WTList: Fetch Failed", e);
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

            // Wipe local data
            WTDb.deleteBranchRecords(conn.my_branch_id);
            WTDb.deleteBranchRecords(conn.partner_branch_id);

            // Notify text page
            window.dispatchEvent(new CustomEvent("walkie-typie:disconnected", {
                detail: { partnerUid }
            }));

            this.selectedConnection = null;
            this.render();
        }
    },

    render() {
        if (!this.elements.container) return;

        // Clear
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
                    console.error("Tag update failed", err);
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

        // Initialize / Refresh InfiniteList — initial cursor at top (index 0)
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
