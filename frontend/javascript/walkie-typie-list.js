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

export const WTList = {
    elements: {
        container: document.querySelector(".walkie-typie-list-list-container"),
        input: document.getElementById("walkie-typie-add-uid"),
        addBtn: document.getElementById("walkie-typie-add-btn"),
    },
    
    connections: [], // Local cache of connections

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
                        const res = await fetch('/api/walkie-typie/connections', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify({ uid })
                        });
                        const data = await res.json();

                        if (res.ok) {
                            msg.update("LINKED.");
                            this.elements.input.value = "";
                            // The list will update via WebSocket or we can manually refresh
                            await this.fetchConnections(); 
                        } else {
                            msg.close();
                            BBMessage.error(data.message || "LINK FAILED.");
                        }
                    } catch (e) {
                        msg.close();
                        BBMessage.error("OFFLINE.");
                    }
                }
            });
        }

        // Listen for real-time updates from Core
        window.addEventListener("walkie-typie:connection-update", (e) => {
            const newConn = e.detail;
            this.handleUpdate(newConn);
        });
    },

    async fetchConnections() {
        try {
            const res = await fetch('/api/walkie-typie/connections');
            if (!res.ok) return; // Maybe unauthorized
            const data = await res.json();
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
            
            // Format timestamp (simple version)
            const date = new Date(Number(conn.last_signal));
            const timeStr = date.toLocaleTimeString();

            item.innerHTML = `
                <div class="walkie-typie-list-tag">${conn.partner_tag || "Unnamed"}</div>
                <div class="walkie-typie-list-last-signal">${timeStr}</div>
                <div class="walkie-typie-list-uid">${conn.partner_uid}</div>
            `;
            
            // Add click listener for selection (future step)
            item.addEventListener("click", () => {
                // Select user logic here
                document.querySelectorAll(".walkie-typie-list-list-item").forEach(el => el.classList.remove("active"));
                item.classList.add("active");
                // TODO: Notify Text module to switch context
            });

            this.elements.container.appendChild(item);
        });
    }
};

// Init if user is logged in
if (localStorage.getItem("currentUser")) {
    WTList.init();
}

window.addEventListener("blackboard:authUpdated", () => {
    WTList.init();
});
