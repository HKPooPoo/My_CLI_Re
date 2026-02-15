/**
 * Blackboard Message Facade (Themed)
 * =================================================================
 * Introduction: Unified message interface for the Blackboard system.
 * Responsibilities:
 * 1. Encapsulate ToastMessager calls.
 * 2. Standardize feedback text with terminal-style prefixes.
 * 3. Provide semantic notification interfaces (info, error, success).
 * Dependencies: toast.js
 * =================================================================
 */

import toast from "./toast.js";

/**
 * Message Wrapper: Ensures prefixes are preserved during updates.
 */
function wrapHandler(handler, prefix) {
    return {
        update: (text, duration) => handler.update(`${prefix}${text}`, duration),
        close: () => handler.close()
    };
}

export const BBMessage = {
    /**
     * System information (Terminal Style)
     */
    info(text) {
        const prefix = "SYSTEM > ";
        return wrapHandler(toast.addMessage(`${prefix}${text}`), prefix);
    },

    /**
     * System warning/error
     */
    error(text) {
        const prefix = "CRITICAL > ";
        return wrapHandler(toast.addMessage(`${prefix}${text}`), prefix);
    },

    /**
     * Operation success shortcut
     */
    success(action) {
        const prefix = "SYSTEM > ";
        return wrapHandler(toast.addMessage(`${prefix}${action} COMPLETE.`), prefix);
    },

    /**
     * Auth requirement
     */
    requireLogin() {
        return this.error("LOGIN REQUIRED FOR THIS OPERATION.");
    }
};
