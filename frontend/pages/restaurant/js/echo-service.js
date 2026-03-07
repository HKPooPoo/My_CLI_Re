/**
 * Restaurant Echo service — connects to Reverb WebSocket.
 * Subscribes to public 'restaurant-orders' channel for instant sync.
 */

let _echo = null;

async function init() {
    const res = await fetch('/api/walkie-typie/config', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Echo config fetch failed');
    const config = await res.json();

    const host = window.location.hostname;
    const port = window.location.port
        ? parseInt(window.location.port)
        : (location.protocol === 'https:' ? 443 : 80);
    const isTLS = location.protocol === 'https:';

    _echo = new window.Echo({
        broadcaster: 'reverb',
        key: config.key,
        wsHost: host,
        wsPort: port,
        wssPort: port,
        forceTLS: isTLS,
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
    });
    return _echo;
}

export async function getEcho() {
    if (_echo) return _echo;
    return init();
}
