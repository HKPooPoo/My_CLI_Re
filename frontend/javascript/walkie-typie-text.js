/**
 * Walkie-Typie Text - Twin Blackboard Controller
 * =================================================================
 * Responsibilities:
 * 1. Handle selection from the list (load twin blackboards).
 * 2. Manage "Our" blackboard (Editable, Syncs to DB & Cloud).
 * 3. Manage "Their" blackboard (Read-only, Real-time updates from WebSocket).
 * 4. Handle "Switch" button to toggle view positions.
 * =================================================================
 */

import { BBCore } from "./blackboard-core.js";
import { BBMessage } from "./blackboard-msg.js";
import { WTCore } from "./walkie-typie-core.js"; // For accessing echo if needed, or listen to global events
import { WalkieTypieService } from "./services/walkie-typie-service.js";
import { BBVCS } from "./blackboard-vcs.js";
import { BlackboardService } from "./services/blackboard-service.js";

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
    
    // VCS States
    weState: { owner: "local", branchId: 0, branch: "WE", currentHead: 0, maxSlot: 10, isVirtual: false },
    theyState: { owner: "local", branchId: 0, branch: "THEY", currentHead: 0, maxSlot: 10, isVirtual: false },

    init() {
        this.bindEvents();
        
        // Load preference
        const savedSwap = localStorage.getItem("wt_swap_pref");
        if (savedSwap === "true") {
            this.toggleSwap(true);
        }
    },

    bindEvents() {
        // Listen for connection selection
        window.addEventListener("walkie-typie:selected", (e) => {
            this.loadConnection(e.detail);
        });

        // Switch Button
        if (this.elements.switchBtn) {
            this.elements.switchBtn.addEventListener("click", () => {
                this.toggleSwap();
            });
        }

        // VCS Buttons
        this.elements.wePushBtn?.addEventListener("click", async () => {
            await BBVCS.push(this.weState, this.elements.weTextarea.value);
            await this.refreshBoards();
        });
        this.elements.wePullBtn?.addEventListener("click", async () => {
            await BBVCS.pull(this.weState, this.elements.weTextarea.value);
            await this.refreshBoards();
        });
        this.elements.theyPushBtn?.addEventListener("click", async () => {
            // "They" board is read-only for us, so Push (Create New) might not make sense unless we want to "Fork"?
            // Or just navigate history forward.
            // Since we can't edit, we pass current text but it won't be saved if unchanged.
            await BBVCS.push(this.theyState, this.elements.theyTextarea.value);
            await this.refreshBoards();
        });
        this.elements.theyPullBtn?.addEventListener("click", async () => {
            await BBVCS.pull(this.theyState, this.elements.theyTextarea.value);
            await this.refreshBoards();
        });

        // Real-time updates from partner (Their Blackboard)
        window.addEventListener("walkie-typie:content-update", (e) => {
            if (!this.currentConnection) return;
            const { branchId, text, timestamp } = e.detail;
            
            // Check if this update belongs to the partner's branch we are viewing
            if (String(branchId) === String(this.currentConnection.partner_branch_id)) {
                this.updateTheirBoard(text, timestamp);
            }
        });
        
        // My Blackboard Input (Auto-save & Broadcast)
        if (this.elements.weTextarea) {
            this.elements.weTextarea.addEventListener("input", this.handleMyInput.bind(this));
        }
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
        console.group("WTText: Loading Connection");
        console.log("Connection Data:", connection);
        
        this.currentConnection = connection;
        
        // Update State IDs
        this.weState.branchId = connection.my_branch_id;
        this.theyState.branchId = connection.partner_branch_id;
        console.log(`State Updated: WE=${this.weState.branchId}, THEY=${this.theyState.branchId}`);
        
        // Reset Heads
        this.weState.currentHead = 0;
        this.theyState.currentHead = 0;
        this.weState.isVirtual = false;
        this.theyState.isVirtual = false;
        
        // Wait a bit to ensure UI transitions don't block logic
        setTimeout(async () => {
            try {
                // [Sync] Fetch latest data from backend for partner's branch
                await this.syncPartnerBranch();
                await this.refreshBoards();
            } catch (err) {
                console.error("WTText: Critical Error in load sequence", err);
            } finally {
                console.groupEnd();
            }
        }, 500);
    },

    /**
     * Pulls the latest data for the partner's branch from the backend
     * and updates the local IndexedDB.
     */
    async syncPartnerBranch() {
        if (!this.currentConnection) {
            console.error("WTText: No current connection during sync");
            return;
        }

        const partnerBranchId = this.currentConnection.partner_branch_id;
        console.log(`WT: Syncing Partner Branch ${partnerBranchId}...`);
        
        try {
            const data = await BlackboardService.fetchBranchDetails(partnerBranchId);
            console.log(`WT: API Response for Branch ${partnerBranchId}:`, data);

            if (data && data.records && data.records.length > 0) {
                // Bulk add/update local cache
                const records = data.records.map(r => ({
                    owner: "local", // Keep using local so we can query it easily
                    branchId: partnerBranchId,
                    branch: "THEY",
                    timestamp: parseInt(r.timestamp),
                    text: r.text,
                    bin: r.bin
                }));
                
                const lastRecord = records[records.length-1];
                console.log("WT: Saving latest record to Dexie:", lastRecord);

                // We shouldn't overwrite "WE" records, but branchId differs so it's safe.
                // Use bulkPut to upsert
                await BBCore.addRecord("local", partnerBranchId, "THEY", lastRecord.text);
                console.log(`WT: Saved successfully.`);
            } else {
                console.warn("WT: No records found in API response.");
            }
        } catch (e) {
            console.error("WTText: Sync Failed Exception:", e);
        }
    },

    async refreshBoards() {
        console.group("WTText: Refresh Boards");
        if (!this.currentConnection) {
            console.error("No connection");
            console.groupEnd();
            return;
        }

        // Update Titles
        const title = (this.currentConnection.partner_tag || this.currentConnection.partner_uid).toUpperCase();
        this.elements.theyTitle.textContent = title;
        console.log(`Set Title: ${title}`);
        
        // Load "My" Content (Local) using state.currentHead
        try {
            const myRecord = await BBCore.getRecord("local", this.weState.branchId, this.weState.currentHead);
            this.elements.weTextarea.value = myRecord ? myRecord.text : "";
            if (this.weState.isVirtual && this.weState.currentHead === 0) {
                 this.elements.weTextarea.value = ""; // Virtual page is blank
            }
        } catch (err) {
            console.error("Error reading MY record:", err);
        }

        // Load "Their" Content using state.currentHead
        console.log(`WT: Reading IDB for THEY: Branch=${this.theyState.branchId}, Head=${this.theyState.currentHead}`);
        try {
            const theirRecord = await BBCore.getRecord("local", this.theyState.branchId, this.theyState.currentHead); 
            console.log(`WT: Read Result (THEY):`, theirRecord);

            this.elements.theyTextarea.value = theirRecord ? theirRecord.text : "";
        } catch (err) {
            console.error("Error reading THEIR record:", err);
        }
        
        // Ensure read-only
        this.elements.theyTextarea.setAttribute("readonly", "true");
        console.groupEnd();
    },

    handleMyInput(e) {
        if (!this.currentConnection) return;
        
        const text = e.target.value;
        const branchId = this.currentConnection.my_branch_id;
        
        // User typed: Reset to Head 0 (Present)
        this.weState.currentHead = 0;
        this.weState.isVirtual = false; 

        // 1. Instant Local Save & Broadcast (Fast/Optimistic)
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(async () => {
            await BBCore.addRecord("local", branchId, "WE", text);
            this.broadcastUpdate(text);
        }, 200); 

        // 2. Persistent Backend Commit (Slower/Reliable)
        clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(async () => {
            try {
                if (!text || !text.trim()) return;

                const record = {
                    timestamp: Date.now(), 
                    text: text,
                    bin: null
                };
                
                await BlackboardService.commit({
                    branchId: branchId,
                    branchName: "WE", 
                    records: [record]
                });
            } catch (err) {
                console.error("WT: Cloud Save Failed", err);
            }
        }, 2000); 
    },
    
    async broadcastUpdate(text) {
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

    async updateTheirBoard(text, timestamp) {
        if (text !== null && text !== undefined) {
            // Instant update with content
            this.elements.theyTextarea.value = text;
            if (this.currentConnection) {
                 BBCore.addRecord("local", this.currentConnection.partner_branch_id, "THEY", text); // Cache it
            }
        } else {
            // Signal only (Persistent update or check) -> Sync from Backend
            console.log("WT: Received Signal (No Content), Syncing...");
            await this.syncPartnerBranch();
            await this.refreshBoards();
        }
    }
};

// Init
WTText.init();
