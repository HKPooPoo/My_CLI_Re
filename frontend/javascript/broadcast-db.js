/**
 * Broadcast DB - IndexedDB Operations
 * =================================================================
 * 介紹：BC 專用的本地資料層。操作 Dexie 的 broadcast_boards 與 broadcast_channels 表。
 * 依賴：indexedDB.js (Dexie instance)
 * =================================================================
 */

import db, { Dexie } from './indexedDB.js';
export { getHKTTimestamp } from './utils.js';
import * as Settings from './settings.js';

// =============================================================
//  Board Operations (broadcast_boards)
// =============================================================

export const BCDb = {
    async getRecord(localChannelId, index) {
        return await db.broadcast_boards
            .where('[local_channel_id+timestamp]')
            .between([localChannelId, Dexie.minKey], [localChannelId, Dexie.maxKey])
            .reverse()
            .offset(index)
            .first();
    },

    async addRecord(localChannelId, text = '', fileHash = null) {
        return await db.broadcast_boards.add({
            local_channel_id: localChannelId,
            timestamp: Date.now(),
            text,
            file_hash: fileHash
        });
    },

    async updateTextInPlace(localChannelId, timestamp, text) {
        await db.broadcast_boards.update([localChannelId, timestamp], { text });
    },

    async updateText(localChannelId, oldTimestamp, text) {
        const oldRecord = await db.broadcast_boards.get([localChannelId, oldTimestamp]);
        if (!oldRecord) return oldTimestamp;

        await db.broadcast_boards.delete([localChannelId, oldTimestamp]);
        const newTimestamp = Math.max(Date.now(), oldTimestamp + 1);
        await db.broadcast_boards.add({
            ...oldRecord,
            text,
            timestamp: newTimestamp
        });
        return newTimestamp;
    },

    async updateBinInPlace(localChannelId, timestamp, binData) {
        await db.broadcast_boards.update([localChannelId, timestamp], { file_hash: binData });
    },

    async countRecords(localChannelId) {
        return await db.broadcast_boards
            .where('[local_channel_id+timestamp]')
            .between([localChannelId, Dexie.minKey], [localChannelId, Dexie.maxKey])
            .count();
    },

    async getAllRecords(localChannelId) {
        return await db.broadcast_boards
            .where('[local_channel_id+timestamp]')
            .between([localChannelId, Dexie.minKey], [localChannelId, Dexie.maxKey])
            .reverse()
            .toArray();
    },

    async deleteAllRecords(localChannelId) {
        const keys = await db.broadcast_boards
            .where('[local_channel_id+timestamp]')
            .between([localChannelId, Dexie.minKey], [localChannelId, Dexie.maxKey])
            .primaryKeys();
        return await db.broadcast_boards.bulkDelete(keys);
    },

    async cleanupOldRecords(localChannelId, maxSlot) {
        const records = await db.broadcast_boards
            .where('[local_channel_id+timestamp]')
            .between([localChannelId, Dexie.minKey], [localChannelId, Dexie.maxKey])
            .sortBy('timestamp');

        if (records.length > maxSlot) {
            const toDelete = records.slice(0, records.length - maxSlot);
            const keysToDelete = toDelete.map(r => [r.local_channel_id, r.timestamp]);
            await db.broadcast_boards.bulkDelete(keysToDelete);
        }
    },

    async scrubBranch(localChannelId, maxSlot) {
        const emptyKeys = await db.broadcast_boards
            .where('[local_channel_id+timestamp]')
            .between([localChannelId, Dexie.minKey], [localChannelId, Dexie.maxKey])
            .filter(item => (!item.text || item.text.trim() === '') && !item.file_hash)
            .primaryKeys();

        if (emptyKeys.length > 0) {
            await db.broadcast_boards.bulkDelete(emptyKeys);
        }

        if (maxSlot) {
            await this.cleanupOldRecords(localChannelId, maxSlot);
        }
    },

    async importRecords(localChannelId, serverRecords) {
        const rows = serverRecords.map(r => ({
            local_channel_id: localChannelId,
            timestamp: parseInt(r.timestamp),
            text: r.text || '',
            file_hash: r.file_hash ? {
                hash: r.file_hash,
                name: r.file_name || 'unknown',
                size: r.file_size || 0,
                mime: r.file_mime || 'application/octet-stream'
            } : null
        }));
        return await db.broadcast_boards.bulkPut(rows);
    },

    /**
     * Swap two records' head positions by exchanging timestamps. Used by
     * the inline .branch-head reorder UI (owner mode only). Head 0 =
     * newest. `toHead` is clamped to `[0, records.length - 1]`. Returns
     * the new head index of the record that was at `fromHead`. -1 on
     * empty channel.
     */
    async swapRecordsByHead(localChannelId, fromHead, toHead) {
        const records = await this.getAllRecords(localChannelId);
        if (records.length === 0) return -1;
        // getAllRecords already returns DESC (head 0 = newest)
        const maxHead = records.length - 1;
        const from = Math.max(0, Math.min(fromHead, maxHead));
        const to = Math.max(0, Math.min(toHead, maxHead));
        if (from === to) return from;
        const a = records[from];
        const b = records[to];
        await db.transaction('rw', db.broadcast_boards, async () => {
            await db.broadcast_boards.delete([localChannelId, a.timestamp]);
            await db.broadcast_boards.delete([localChannelId, b.timestamp]);
            await db.broadcast_boards.put({ ...a, timestamp: b.timestamp });
            await db.broadcast_boards.put({ ...b, timestamp: a.timestamp });
        });
        return to;
    }
};

// =============================================================
//  Channel Metadata Operations (broadcast_channels)
// =============================================================

export const BCMeta = {
    async createChannel(name) {
        return await db.broadcast_channels.add({
            name,
            server_channel_id: null,
            owner_uid: localStorage.getItem('currentUser') || '',
            // Snapshot owner's title so an uncast channel row can show the
            // creator's title even before the server has a record of it.
            owner_title: localStorage.getItem('currentTitle') || '',
            last_signal: Date.now()
        });
    },

    /**
     * Build local metadata + records from a server channel. Used when the
     * logged-in owner opens a channel they own but have no local copy of
     * (cross-device / after WIPE LOCAL). Idempotent — if a local entry for
     * this server_channel_id already exists, returns its local_id unchanged.
     *
     * @param {Object} serverSide   { id, name, owner_uid, owner_title, last_signal }
     * @param {Array}  records      Server records (timestamp is the ordering key)
     * @returns {number} local_id
     */
    async bootstrapFromServer(serverSide, records) {
        return await db.transaction('rw', db.broadcast_channels, db.broadcast_boards, async () => {
            const existing = await db.broadcast_channels
                .where('server_channel_id')
                .equals(serverSide.id)
                .first();
            if (existing) return existing.local_id;

            const localId = await db.broadcast_channels.add({
                name: serverSide.name,
                server_channel_id: serverSide.id,
                owner_uid: serverSide.owner_uid,
                owner_title: serverSide.owner_title || '',
                last_signal: serverSide.last_signal || Date.now()
            });

            if (records && records.length > 0) {
                await db.broadcast_boards.bulkAdd(records.map(r => ({
                    local_channel_id: localId,
                    timestamp: parseInt(r.timestamp),
                    text: r.text || '',
                    file_hash: r.file_hash ?? null
                })));
            }

            return localId;
        });
    },

    async getAllChannels() {
        return await db.broadcast_channels.toArray();
    },

    async getChannel(localId) {
        return await db.broadcast_channels.get(localId);
    },

    async getChannelByServerId(serverChannelId) {
        return await db.broadcast_channels
            .where('server_channel_id')
            .equals(serverChannelId)
            .first();
    },

    async getChannelByName(name) {
        return await db.broadcast_channels.where('name').equals(name).first();
    },

    async renameChannel(localId, newName) {
        await db.broadcast_channels.update(localId, { name: newName });
    },

    async setServerChannelId(localId, serverChannelId) {
        await db.broadcast_channels.update(localId, { server_channel_id: serverChannelId });
    },

    async updateLastSignal(localId, lastSignal) {
        await db.broadcast_channels.update(localId, { last_signal: lastSignal });
    },

    async deleteChannel(localId) {
        await BCDb.deleteAllRecords(localId);
        await db.broadcast_channels.delete(localId);
    }
};
