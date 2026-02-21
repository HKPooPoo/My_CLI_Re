/**
 * Walkie-Typie Core - Communication & Event Handling
 * =================================================================
 * Responsibilities:
 * 1. Initialize Laravel Echo (Reverb) connection via shared echo-service.
 * 2. Manage private channel subscription for the current user.
 * 3. Dispatch global events for other modules to consume.
 * =================================================================
 */

import { BBMessage } from "./blackboard-msg.js";
import { getEcho, releaseEcho } from './echo-service.js';

export const WTCore = {
    uid: null,

    async init() {
        this.uid = localStorage.getItem("currentUser");
        if (!this.uid || this.uid === "local") return;
        try {
            const echo = await getEcho();
            // Guard: check still logged in after async config fetch
            if (!localStorage.getItem("currentUser")) return;

            echo.private(`App.Models.User.${this.uid}`)
                .listen('.walkie-typie.updated', (e) => {
                    window.dispatchEvent(new CustomEvent("walkie-typie:connection-update", {
                        detail: e.connectionData
                    }));
                    BBMessage.info(`SIGNAL: ${e.connectionData.partner_uid}`);
                })
                .listen('.walkie-typie.content', (e) => {
                    window.dispatchEvent(new CustomEvent("walkie-typie:content-update", {
                        detail: e.contentData
                    }));
                });
            console.log(`WT: Listening on App.Models.User.${this.uid}`);
        } catch (e) {
            console.error('WT Core Init Failed:', e);
        }
    }
};

if (localStorage.getItem("currentUser")) WTCore.init();

window.addEventListener("blackboard:authUpdated", () => {
    releaseEcho();
    WTCore.init();
});
