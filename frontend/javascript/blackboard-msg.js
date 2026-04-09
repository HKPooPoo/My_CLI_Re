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
import { t } from './i18n.js';

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
        const prefix = t('toast.systemPrefix');
        return wrapHandler(toast.addMessage(`${prefix}${text}`, 5000, 'info'), prefix);
    },

    /**
     * System warning/error
     */
    error(text) {
        const prefix = t('toast.criticalPrefix');
        return wrapHandler(toast.addMessage(`${prefix}${text}`, 5000, 'error'), prefix);
    },

    /**
     * Operation success shortcut
     */
    success(action) {
        const prefix = t('toast.systemPrefix');
        return wrapHandler(toast.addMessage(`${prefix}${action}`, 5000, 'success'), prefix);
    },

    /**
     * Loading state (spinner-compatible via data-loading attribute)
     */
    loading(text) {
        const prefix = t('toast.systemPrefix');
        return wrapHandler(toast.addMessage(`${prefix}${text}`, 0, 'info', true), prefix);
    },

    /**
     * Auth requirement
     */
    requireLogin() {
        return this.error(t('system.loginRequired'));
    }
};

// [429 UX]: Listen for rate-limit events from api.js and show user-facing toast
window.addEventListener('api:rateLimited', () => {
    BBMessage.error(t('api.rateLimited'));
});
