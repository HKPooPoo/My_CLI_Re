/**
 * Inbox HTTP service. Thin wrapper over /api/inboxes/*.
 *
 * The subsystem follows the same local-first / manual-sync model
 * as BB and BC: the textarea auto-saves to IndexedDB on a 200ms
 * debounce, but pushing to the server is an explicit user action
 * (POST button on the thread page). PULL is the inverse — re-fetch
 * the latest server snapshot into IDB.
 */

import { apiRequest } from './api.js';

export const InboxService = {
    listInboxes(signal) {
        return apiRequest('/inboxes', signal ? { signal } : {});
    },

    create(data) {
        return apiRequest('/inboxes', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    update(inboxId, data) {
        return apiRequest(`/inboxes/${inboxId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },

    destroy(inboxId) {
        return apiRequest(`/inboxes/${inboxId}`, { method: 'DELETE' });
    },

    applyWhitelist(inboxId, whitelistId) {
        return apiRequest(`/inboxes/${inboxId}/whitelist`, {
            method: 'PUT',
            body: JSON.stringify({ whitelist_id: whitelistId }),
        });
    },

    /** Owner-side: every submission to this inbox. */
    fetchSubmissions(inboxId, signal) {
        return apiRequest(`/inboxes/${inboxId}/submissions`,
            signal ? { signal } : {});
    },

    /** Sender-side: my own submission. Returns { submission: null } when
     *  I haven't submitted yet — not an error, the front-end shows the
     *  empty form. */
    getMySubmission(inboxId, signal) {
        return apiRequest(`/inboxes/${inboxId}/submission`,
            signal ? { signal } : {});
    },

    /** Sender-side push. Idempotent on (inbox, sender). */
    submit(inboxId, data) {
        return apiRequest(`/inboxes/${inboxId}/submission`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    /** Receiver-side: write feedback on a specific sender's row. */
    writeFeedback(inboxId, senderUid, receiverText) {
        return apiRequest(`/inboxes/${inboxId}/submission/${senderUid}/feedback`, {
            method: 'PUT',
            body: JSON.stringify({ receiver_text: receiverText }),
        });
    },
};
