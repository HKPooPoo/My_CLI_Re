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
                    await fetch(`/api/walkie-typie/connections/${conn.partner_uid}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ tag: newTag })
                    });
                    // Update local cache
                    conn.partner_tag = newTag;
                } catch (err) {
                    console.error("Tag update failed", err);
                    BBMessage.error("TAG UPDATE FAILED");
                }
            });
            
            // Prevent row selection when clicking input
            tagInput.addEventListener("click", (e) => e.stopPropagation());

            // Add click listener for selection
            item.addEventListener("click", () => {
                document.querySelectorAll(".walkie-typie-list-list-item").forEach(el => el.classList.remove("active"));
                item.classList.add("active");
                
                // Notify selection change
                // We delay slightly to allow UI feedback
                setTimeout(() => {
                    // Update the Text interface (Twin Blackboard)
                    // We need to implement walkie-typie-text.js to listen to this event
                    // But for now, we just dispatch the event.
                    // The logic for "update text UI" will be in the next step/module.
                    
                    // However, per requirements: "Select directly updates text interface content in 1s"
                    // Wait, requirement says "1秒後直接更新text界面的内容" (updates text interface content directly after 1 second).
                    // This implies the list selection triggers a delayed update.
                    
                    // But here we just dispatch event or call a global handler.
                    // Let's dispatch a custom event with the connection details.
                     window.dispatchEvent(new CustomEvent("walkie-typie:selected", {
                        detail: conn
                    }));
                }, 100); // Small delay for visual click feedback, actual content load might handle the 1s delay or just be instant.
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
