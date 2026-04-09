/**
 * echo-service.js — Shared Laravel Echo singleton
 * ================================================
 * Both WTCore (private channel) and BCChannel (public channel) call getEcho().
 * One WebSocket connection serves both. Public channels need no session auth;
 * private channels authenticate per-subscription via authEndpoint.
 */

let _echo = null;
let _configPromise = null;

async function _fetchConfig() {
    const res = await fetch('/api/walkie-typie/config', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Echo config fetch failed');
    return res.json();
}

export async function getEcho() {
    if (_echo) return _echo;
    if (!_configPromise) _configPromise = _fetchConfig();

    const config = await _configPromise;
    const host  = window.location.hostname;
    const port  = window.location.port
        ? parseInt(window.location.port)
        : (location.protocol === 'https:' ? 443 : 80);
    const isTLS = location.protocol === 'https:';

    _echo = new window.Echo({
        broadcaster:       'reverb',
        key:               config.key,
        wsHost:            host,
        wsPort:            port,
        wssPort:           port,
        forceTLS:          isTLS,
        enabledTransports: ['ws', 'wss'],
        disableStats:      true,
        authEndpoint:      '/api/broadcasting/auth',
    });
    return _echo;
}

export function releaseEcho() {
    _echo?.disconnect();
    _echo = null;
    _configPromise = null;
}
