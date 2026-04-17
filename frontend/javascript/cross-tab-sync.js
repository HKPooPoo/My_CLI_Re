/**
 * Cross-Tab Sync
 * =================================================================
 * Lightweight event bus over BroadcastChannel for "heads up, local
 * state changed in another tab on this device" signals.
 *
 * Receivers should re-read from IndexedDB rather than trust the
 * message payload — the message is just a trigger, the DB is the
 * source of truth.
 *
 * Not a replacement for server-side sync (WebSocket via Reverb) —
 * that covers cross-DEVICE updates. This one covers cross-TAB on
 * the same device where WebSocket events don't reach the observer
 * tab because they target a specific user_id channel and only one
 * tab owns the Echo connection at a time.
 * =================================================================
 */

const CHANNEL_NAME = 'mycli-sync';

let _channel = null;
function _getChannel() {
    if (_channel) return _channel;
    if (typeof BroadcastChannel === 'undefined') {
        console.warn('[cross-tab-sync] BroadcastChannel unsupported — falling back to no-op');
        return null;
    }
    _channel = new BroadcastChannel(CHANNEL_NAME);
    return _channel;
}

/**
 * Post a message to all other tabs.
 * @param {string} type  e.g. 'bb:record:mutated'
 * @param {object} [detail]
 */
export function broadcast(type, detail) {
    const ch = _getChannel();
    if (!ch) return;
    try {
        ch.postMessage({ type, detail: detail ?? null });
    } catch (err) {
        console.warn('[cross-tab-sync] broadcast failed:', err);
    }
}

/**
 * Subscribe to a message type from other tabs. Returns an unsubscribe fn.
 * Note: the sender does NOT receive its own messages (BroadcastChannel
 * spec), so no self-echo guard is needed.
 */
export function on(type, listener) {
    const ch = _getChannel();
    if (!ch) return () => {};
    const wrapped = (event) => {
        if (event.data?.type === type) listener(event.data.detail);
    };
    ch.addEventListener('message', wrapped);
    return () => ch.removeEventListener('message', wrapped);
}
