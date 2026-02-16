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

export const WTText = {
    elements: {
        container: document.querySelector(".page[data-page='walkie-typie-text']"),
        weTitle: document.querySelector(".walkie-typie-blackboard-we-title"),
        theyTitle: document.querySelector(".walkie-typie-blackboard-they-title"),
        weTextarea: document.getElementById("walkie-typie-we-blackboard"),
        theyTextarea: document.getElementById("walkie-typie-they-blackboard"),
        switchBtn: document.getElementById("walkie-typie-blackboard-feature-switch"),
        // Buttons (optional, per requirement A can push/pull but limited?)
        // "A用戶可以push and pull雙方的頁面，但是不能編輯對方的textarea"
        // We might need to implement push/pull logic later or hook into existing.
    },

    currentConnection: null,
    isSwapped: false, // Default: Theirs on Top (DOM order: We first? Wait, CSS check needed)

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

        // CSS flex-direction handles this easily if container is flex col
        // Default walkie-typie-text page is block? Need to check CSS.
        // If it's flex column, we just change order.
        // Let's assume we toggle a class `swapped` on the container.
        
        if (this.isSwapped) {
            container.classList.add("swapped");
        } else {
            container.classList.remove("swapped");
        }
    },

    async loadConnection(connection) {
        this.currentConnection = connection;
        
        // 1s Delay as per requirement (simulated loading)
        // "選中後在1秒後直接更新text界面的内容"
        // We can show a loading state if needed, or just wait.
        // Let's assume we navigate immediately but content loads after 1s?
        // Or navigation happens 1s later? 
        // "Using blackboard list cursor logic... select then 1s later update text interface"
        // I'll simulate the delay here.
        
        // Trigger Page Navigation (using navi.js logic? or just manually switching?)
        // Usually navigation is handled by navi.js clicking menu items.
        // Here we are in LIST page, selecting an item. We should probably auto-switch to TEXT page.
        // Dispatch event to Navi to switch page?
        // Let's wait 1s then switch and load.
        
        setTimeout(async () => {
            // Switch to Text Page
            const naviItem = document.querySelector("[data-sub-navi-item='walkie-typie-text']");
            if (naviItem) naviItem.click(); // Trigger navi logic

            await this.refreshBoards();
        }, 1000);
    },

    async refreshBoards() {
        if (!this.currentConnection) return;

        const myBranchId = this.currentConnection.my_branch_id;
        const theirBranchId = this.currentConnection.partner_branch_id;

        // Update Titles
        // "Theirs" title should use partner tag/uid
        this.elements.theyTitle.textContent = (this.currentConnection.partner_tag || this.currentConnection.partner_uid).toUpperCase();
        
        // Load "My" Content (Local)
        // We need a way to get the latest text for a specific branch ID from IndexedDB
        const myRecord = await BBCore.getRecord("local", myBranchId, 0);
        this.elements.weTextarea.value = myRecord ? myRecord.text : "";

        // Load "Their" Content (Local Cache or Fetch?)
        // Ideally "Their" content is also stored locally if we pulled it.
        // But for "Twin" logic, we might not have it yet.
        // We should try to fetch from DB first (synced copy).
        // Since we can't "Edit" theirs, we are just a viewer.
        // We treat their branch as "remote" owner?
        // Actually, for Walkie-Typie, we might store their data with owner=`partner_${uid}`?
        // Or just use `local` owner but different branch ID?
        // If we use `local` owner, we can edit it.
        // Requirement: "不能編輯對方的textarea". So we should enforce readonly on UI.
        
        // Let's assume we store it as `local` but UI blocks editing.
        // OR we store it as `synced`?
        
        const theirRecord = await BBCore.getRecord("local", theirBranchId, 0); 
        // Note: getRecord("local") gets what we have.
        this.elements.theyTextarea.value = theirRecord ? theirRecord.text : "";
        
        // Ensure read-only
        this.elements.theyTextarea.setAttribute("readonly", "true");
    },

    handleMyInput(e) {
        if (!this.currentConnection) return;
        
        // Debounce logic could be here, or just save/broadcast frequently.
        // "Action refers to input and save updates update time"
        // We should save to IndexedDB and Broadcast.
        
        const text = e.target.value;
        const branchId = this.currentConnection.my_branch_id;
        
        // Save to Local DB (debounced usually, but for "Walkie-Typie" maybe faster?)
        // Let's reuse a debounce approach.
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(async () => {
            await BBCore.addRecord("local", branchId, "WE", text);
            // Broadcast to partner via API
            // We need a new API endpoint for sending signals/text?
            // Or reuse "commit"? Walkie-Typie usually implies lighter weight signal.
            // Requirement says "Websocketing rather than polling".
            // We need to trigger an event on the server that broadcasts to the partner.
            
            this.broadcastUpdate(text);
        }, 500);
    },
    
    async broadcastUpdate(text) {
        try {
            await WalkieTypieService.sendSignal({
                partner_uid: this.currentConnection.partner_uid,
                text: text,
                branch_id: this.currentConnection.partner_branch_id // Tell them which branch to update (THEIR copy of MY branch)
            });
        } catch (e) {
            console.error("Signal failed", e);
        }
    },

    updateTheirBoard(text, timestamp) {
        this.elements.theyTextarea.value = text;
        // Optionally flash or highlight
        // Also save to local DB as cached "Theirs"
        if (this.currentConnection) {
             BBCore.addRecord("local", this.currentConnection.partner_branch_id, "THEY", text); // Cache it
        }
    }
};

// Init
WTText.init();
