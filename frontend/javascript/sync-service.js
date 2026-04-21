/**
 * Sync Service — single source of truth for cross-device user settings.
 *
 * Mirrors `users.settings` (backend JSONB) in memory. Features call
 * getSetting / setSetting by dotted path; writes trigger a debounced
 * PUT to the server. Reads happen synchronously from the local
 * mirror — features never await the network on every keystroke.
 *
 * Lifecycle:
 *   - auth:updated (logged in)  → loadSettings() → PUT-ready mirror
 *   - auth:updated (logged out) → reset mirror + cancel pending push
 *   - setSetting(...)            → update mirror + schedule push (2s)
 *
 * Schema (opinionated; backend accepts any JSON object):
 *   {
 *       app:      { autoSync: bool, loopList: bool, ... },
 *       calendar: { "YYYY-MM-DD": "note", ... },
 *   }
 *
 * Last-write-wins — identical to project-wide commit semantics.
 */

import { UserSettingsService } from './services/user-settings-service.js';

const PUSH_DEBOUNCE_MS = 2000;

let _settings = {};
let _loaded = false;
let _pushTimer = null;

function isLoggedIn() {
    const uid = localStorage.getItem('currentUser');
    return !!uid && uid !== 'local';
}

function resolvePath(obj, path) {
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
    }
    return cur;
}

function assignPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
        cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
}

async function loadSettings() {
    if (!isLoggedIn()) {
        _settings = {};
        _loaded = false;
        window.dispatchEvent(new CustomEvent('settings:synced', { detail: { settings: {} } }));
        return;
    }
    try {
        const data = await UserSettingsService.fetch();
        _settings = (data && data.settings && typeof data.settings === 'object') ? data.settings : {};
        _loaded = true;
        window.dispatchEvent(new CustomEvent('settings:synced', { detail: { settings: _settings } }));
    } catch (e) {
        console.error('[sync] load failed:', e);
        _loaded = false;
    }
}

function schedulePush() {
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(pushSettings, PUSH_DEBOUNCE_MS);
}

async function pushSettings() {
    _pushTimer = null;
    if (!isLoggedIn()) return;
    try {
        const data = await UserSettingsService.update(_settings);
        if (data && data.settings) _settings = data.settings;
    } catch (e) {
        console.error('[sync] push failed:', e);
    }
}

// Public API ---------------------------------------------------------

export function getSetting(path, defaultValue) {
    const v = resolvePath(_settings, path);
    return (v === undefined) ? defaultValue : v;
}

export function setSetting(path, value) {
    assignPath(_settings, path, value);
    schedulePush();
    window.dispatchEvent(new CustomEvent('settings:changed', {
        detail: { path, value },
    }));
}

/**
 * Whether the initial server fetch has completed for the current
 * session. Features can key off this to pick local-only vs synced
 * behaviour, though most should just read getSetting() which returns
 * '' / default when empty.
 */
export function isSyncReady() {
    return _loaded;
}

// Boot lifecycle -----------------------------------------------------

window.addEventListener('auth:updated', () => {
    // Flush pending push BEFORE identity flip — current mirror could
    // still belong to the outgoing session.
    if (_pushTimer) {
        clearTimeout(_pushTimer);
        _pushTimer = null;
    }
    loadSettings();
});

// Initial load if already logged in at boot
if (isLoggedIn()) {
    loadSettings();
}
