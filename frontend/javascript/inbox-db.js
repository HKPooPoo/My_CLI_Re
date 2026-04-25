/**
 * Inbox DB - IndexedDB Operations
 * =================================================================
 * Local cache layer for the inbox subsystem. Mirrors broadcast-db.js
 * but with simpler structure: inboxes are server-bound from creation
 * (no local-only drafts), so server_inbox_id is the natural primary
 * key without ++local_id indirection.
 *
 * Submissions are keyed by [server_inbox_id+sender_uid] — one row
 * per (inbox, sender) pair, mirroring the server's UNIQUE constraint.
 * =================================================================
 */

import db from './indexedDB.js';

export const IXMeta = {
    async getAllInboxes() {
        return await db.inboxes.toArray();
    },

    async getInbox(serverInboxId) {
        return await db.inboxes.get(serverInboxId);
    },

    async upsertInbox(meta) {
        // meta: { server_inbox_id, name, description, owner_uid, owner_title,
        //        whitelist_id, last_signal, submission_count, has_my_submission,
        //        my_feedback_at, my_feedback_at_seen }
        const existing = await db.inboxes.get(meta.server_inbox_id);
        const merged = {
            ...(existing || {}),
            ...meta,
        };
        await db.inboxes.put(merged);
        return merged;
    },

    async deleteInbox(serverInboxId) {
        await db.transaction('rw', db.inboxes, db.inbox_submissions, async () => {
            await db.inboxes.delete(serverInboxId);
            const subs = await db.inbox_submissions
                .where('server_inbox_id').equals(serverInboxId)
                .primaryKeys();
            await db.inbox_submissions.bulkDelete(subs);
        });
    },

    /**
     * Mark "I've now seen the latest feedback for this inbox". Stamp
     * `my_feedback_at_seen` so the [NEW] indicator clears. Called
     * when the sender opens the thread page on this inbox.
     */
    async markFeedbackSeen(serverInboxId, feedbackAt) {
        const row = await db.inboxes.get(serverInboxId);
        if (!row) return;
        await db.inboxes.put({
            ...row,
            my_feedback_at_seen: feedbackAt,
        });
    },
};

export const IXSubmissions = {
    /**
     * Composite key lookup. Returns null when no row yet.
     */
    async get(serverInboxId, senderUid) {
        return await db.inbox_submissions.get([serverInboxId, senderUid]);
    },

    /**
     * Upsert. Each save (sender or receiver) goes through here so
     * the row reflects the latest local edits regardless of who
     * wrote them.
     */
    async upsert(row) {
        const existing = await this.get(row.server_inbox_id, row.sender_uid);
        const merged = { ...(existing || {}), ...row };
        await db.inbox_submissions.put(merged);
        return merged;
    },

    async getAllForInbox(serverInboxId) {
        return await db.inbox_submissions
            .where('server_inbox_id').equals(serverInboxId)
            .toArray();
    },

    async deleteForInbox(serverInboxId) {
        const keys = await db.inbox_submissions
            .where('server_inbox_id').equals(serverInboxId)
            .primaryKeys();
        await db.inbox_submissions.bulkDelete(keys);
    },

    /**
     * Replace the receiver-side cache after a /submissions fetch.
     * Drops rows that disappeared from the server (sender's row
     * deleted etc.) and upserts the rest. Sender-side never calls
     * this — they only ever own a single row.
     */
    async replaceForInbox(serverInboxId, rows) {
        await db.transaction('rw', db.inbox_submissions, async () => {
            const existing = await this.getAllForInbox(serverInboxId);
            const incoming = new Set(rows.map(r => r.sender_uid));
            // Drop rows that vanished on the server
            const toDelete = existing
                .filter(r => !incoming.has(r.sender_uid))
                .map(r => [r.server_inbox_id, r.sender_uid]);
            if (toDelete.length) await db.inbox_submissions.bulkDelete(toDelete);
            // Merge incoming over existing (preserves _dirtyReceiver
            // flags written by the local owner during offline edits)
            for (const r of rows) {
                const ex = existing.find(e => e.sender_uid === r.sender_uid);
                await db.inbox_submissions.put({
                    server_inbox_id: serverInboxId,
                    sender_uid: r.sender_uid,
                    sender_title: r.sender_title,
                    sender_text: r.sender_text,
                    file_hash: r.file_hash,
                    receiver_text: ex?._dirtyReceiver ? ex.receiver_text : r.receiver_text,
                    feedback_at: r.feedback_at,
                    submitted_at: r.submitted_at,
                    updated_at: r.updated_at,
                    _dirtySender: ex?._dirtySender || false,
                    _dirtyReceiver: ex?._dirtyReceiver || false,
                });
            }
        });
    },
};
