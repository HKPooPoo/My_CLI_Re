/**
 * Walkie-Typie List - UI Controller
 * =================================================================
 * Responsibilities:
 * 1. Render and update the list of connected users.
 * 2. Handle adding new connections via UID.
 * 3. Sort list by 'last_signal'.
 * =================================================================
 */

import { BBMessage } from "./blackboard-msg.js";
import { MultiStepButton } from "./multiStepButton.js";
import { getHKTTimestamp } from "./blackboard-core.js";
import { WalkieTypieService } from "./services/walkie-typie-service.js";
import { InfiniteList } from "./blackboard-ui-list.js";

export const WTList = {
    elements: {
        container: document.querySelector(".walkie-typie-list-list-container"),
        input: document.getElementById("walkie-typie-add-uid"),
        addBtn: document.getElementById("walkie-typie-add-btn"),
    },
    
    connections: [], // Local cache of connections
    infiniteList: null,

    async init() {
        this.bindEvents();
        await this.fetchConnections();
    },

    bindEvents() {
        if (this.eventsBound) return;
        this.eventsBound = true;

        if (this.elements.addBtn) {
            new MultiStepButton(this.elements.addBtn, {
                sound: "UIPipboyOK.mp3",
                action: async () => {
                    const uid = this.elements.input.value.trim();
                    if (!uid) return;

                    const msg = BBMessage.info("LINKING...");
                    try {
                        await WalkieTypieService.createConnection({ uid });
                        msg.update("LINKED.");
                        this.elements.input.value = "";
                        // The list will update via WebSocket or we can manually refresh
                        await this.fetchConnections(); 
                    } catch (e) {
                        msg.close();
                        BBMessage.error(e.message || "LINK FAILED.");
                    }
                }
            });
        }

        // Listen for real-time updates from Core
        window.addEventListener("walkie-typie:connection-update", (e) => {
            const newConn = e.detail;
            this.handleUpdate(newConn);
        });

        // Listen for list selection (Keyboard/Mouse via InfiniteList)
        window.addEventListener("blackboard:selectionChanged", (e) => {
            const { item } = e.detail;
            // Ensure this selection event comes from our list container
            if (item && this.elements.container.contains(item)) {
                const partnerUid = item.dataset.partnerUid;
                const conn = this.connections.find(c => c.partner_uid === partnerUid);
                
                if (conn) {
                    // [Requirement]: Select directly updates text interface content in 1s
                    // We dispatch immediate selection, let Receiver handle the delay (already implemented in text.js)
                    // Or we can debounce here. Existing text.js has 1s delay.
                    window.dispatchEvent(new CustomEvent("walkie-typie:selected", {
                        detail: conn
                    }));
                }
            }
        });
    },

    async fetchConnections() {
        try {
            const data = await WalkieTypieService.getConnections();
            this.connections = data.connections;
            this.render();
        } catch (e) {
            console.error("WT List Fetch Failed:", e);
        }
    },

    handleUpdate(newConn) {
        // Update local cache
        const index = this.connections.findIndex(c => c.partner_uid === newConn.partner_uid);
        if (index !== -1) {
            this.connections[index] = newConn;
        } else {
            this.connections.push(newConn);
        }
        
        // Sort by last_signal desc
        this.connections.sort((a, b) => b.last_signal - a.last_signal);
        
        this.render();
    },

    render() {
        if (!this.elements.container) return;
        this.elements.container.innerHTML = "";

        this.connections.forEach(conn => {
            const item = document.createElement("div");
            item.className = "walkie-typie-list-list-item";
            item.dataset.partnerUid = conn.partner_uid;
            
            // Use getHKTTimestamp if possible, or fallback
            // conn.last_signal is a timestamp (bigint/number)
            const timeStr = getHKTTimestamp(Number(conn.last_signal));
            const safeTag = (conn.partner_tag || "").replace(/"/g, "&quot;");

            item.innerHTML = `
                <input type="text" class="walkie-typie-list-tag" value="${safeTag}" placeholder="Name this guy..." name="walkie-typie-list-tag" maxlength="64">
                <div class="walkie-typie-list-last-signal">${timeStr}</div>
                <div class="walkie-typie-list-uid">${conn.partner_uid}</div>
            `;
            
            // Tag renaming listener
            const tagInput = item.querySelector(".walkie-typie-list-tag");
            tagInput.addEventListener("change", async (e) => {
                const newTag = e.target.value.trim();
                try {
                    await WalkieTypieService.updateConnectionTag(conn.partner_uid, { tag: newTag });
                    // Update local cache
                    conn.partner_tag = newTag;
                } catch (err) {
                    console.error("Tag update failed", err);
                    BBMessage.error("TAG UPDATE FAILED");
                }
            });
            
            // Prevent row selection when clicking input
            tagInput.addEventListener("click", (e) => e.stopPropagation());

            this.elements.container.appendChild(item);
        });

        // Initialize Infinite List for keyboard/mouse navigation
        if (this.elements.container) {
            this.infiniteList = new InfiniteList(this.elements.container, ".walkie-typie-list-list-item");
        }
    }
};

// Init if user is logged in
if (localStorage.getItem("currentUser")) {
    WTList.init();
}

window.addEventListener("blackboard:authUpdated", () => {
    WTList.init();
});
