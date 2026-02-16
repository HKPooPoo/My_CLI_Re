/**
 * Walkie-Typie Core - Communication & Event Handling
 * =================================================================
 * Responsibilities:
 * 1. Initialize Laravel Echo (Reverb) connection.
 * 2. Manage private channel subscription for the current user.
 * 3. Dispatch global events for other modules to consume.
 * =================================================================
 */

import { BBMessage } from "./blackboard-msg.js";

export const WTCore = {
    echo: null,
    uid: null,

    async init() {
        this.uid = localStorage.getItem("currentUser");
        if (!this.uid || this.uid === "local") return;

        try {
            // Fetch Reverb Config
            const res = await fetch('/api/walkie-typie/config');
            const config = await res.json();

            // Initialize Echo
            // Assumes Pusher and Echo are loaded globally via <script> tags
            if (!window.Pusher || !window.Echo) {
                console.error("Pusher or Echo not loaded.");
                return;
            }

            window.Pusher.logToConsole = false; // Set to true for debugging

            // Use current window location to ensure connection goes through Nginx proxy
            const host = window.location.hostname;
            const port = window.location.port ? parseInt(window.location.port) : (window.location.protocol === 'https:' ? 443 : 80);
            const scheme = window.location.protocol === 'https:';

            this.echo = new window.Echo({
                broadcaster: 'reverb',
                key: config.key,
                wsHost: host,
                wsPort: port,
                wssPort: port,
                forceTLS: scheme,
                enabledTransports: ['ws', 'wss'],
                disableStats: true, // Often good to disable for self-hosted
                authEndpoint: '/api/broadcasting/auth',
            });

            // Subscribe to Private Channel
            this.echo.private(`App.Models.User.${this.uid}`)
                .listen('.walkie-typie.updated', (e) => {
                    // Note: Event name often has a leading dot or namespace issue.
                    // 'broadcastAs' returns 'walkie-typie.updated'.
                    // Laravel Echo usually expects fully qualified class name if not using broadcastAs,
                    // or just the string if using broadcastAs.
                    // With broadcastAs, it might be '.walkie-typie.updated' or 'walkie-typie.updated'.
                    // Let's try 'walkie-typie.updated' first, but Laravel sometimes prepends namespace.
                    // Actually, with broadcastAs(), it should be exactly that string.
                    // However, Echo sometimes adds a dot. Let's log it if possible.
                    console.log("Walkie-Typie Event Received:", e);
                    
                    window.dispatchEvent(new CustomEvent("walkie-typie:connection-update", {
                        detail: e.connectionData
                    }));
                    
                    BBMessage.info(`SIGNAL: ${e.connectionData.partner_uid}`);
                })
                .listen('.walkie-typie.content', (e) => {
                    window.dispatchEvent(new CustomEvent("walkie-typie:content-update", {
                        detail: e.contentData
                    }));
                    // Silent update or minimal log?
                    // console.log("Content received");
                });

            console.log(`WT: Listening on App.Models.User.${this.uid}`);

        } catch (e) {
            console.error("WT Core Init Failed:", e);
        }
    }
};

// Auto-init if user is logged in
if (localStorage.getItem("currentUser")) {
    WTCore.init();
}

// Re-init on auth change
window.addEventListener("blackboard:authUpdated", () => {
    // If logging out, leave channel?
    if (WTCore.echo) {
        WTCore.echo.disconnect();
        WTCore.echo = null;
    }
    WTCore.init();
});
