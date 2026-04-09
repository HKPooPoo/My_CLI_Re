/**
 * Settings - Centralized Settings Accessor
 * =================================================================
 * Scope-prefixed localStorage keys for per-scope settings.
 * Keys: 'setting-{scope}-{key}' for scoped, 'setting-{key}' for global.
 * Dispatches 'settings:changed' on every set.
 * =================================================================
 */

const SCOPES = ['bb', 'wt', 'bc', 'mods'];

const SCOPE_DEFAULTS = {
    bb:   { maxSlot: 10, maxFiles: 10, autoCleanBlanks: true, updateTimestamp: true, autoSync: false, loopList: false },
    wt:   { maxSlot: 10, maxFiles: 10, autoCleanBlanks: true, updateTimestamp: true, loopList: false },
    bc:   { maxSlot: 10, maxFiles: 10, autoCleanBlanks: false, updateTimestamp: false, loopList: false },
    mods: { loopList: false },
};

const GLOBAL_DEFAULTS = {
    locale: 'default',
    globalAudio: '100',
    sfx: '100',
    showHints: true,
    screensaverTimeout: 60,
    crtBlendMode: true,
};

// --- Key helpers ---
function _scopeKey(scope, key) { return `setting-${scope}-${key}`; }
function _globalKey(key) { return `setting-${key}`; }

// --- Type coerce ---
function _coerce(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    const n = Number(value);
    if (!isNaN(n) && value !== '' && value !== null) return n;
    return value;
}

function _serialize(value) {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
}

// --- Migration from old global keys ---
let _migrated = false;
function _migrateOnce() {
    if (_migrated) return;
    _migrated = true;

    const oldSlot = localStorage.getItem('setting-max-slot');
    const oldFiles = localStorage.getItem('setting-max-files');

    if (oldSlot !== null) {
        for (const scope of SCOPES) {
            if (localStorage.getItem(_scopeKey(scope, 'maxSlot')) === null) {
                localStorage.setItem(_scopeKey(scope, 'maxSlot'), oldSlot);
            }
        }
        localStorage.removeItem('setting-max-slot');
    }

    if (oldFiles !== null) {
        for (const scope of SCOPES) {
            if (localStorage.getItem(_scopeKey(scope, 'maxFiles')) === null) {
                localStorage.setItem(_scopeKey(scope, 'maxFiles'), oldFiles);
            }
        }
        localStorage.removeItem('setting-max-files');
    }

    // Migrate wt_swap_pref → setting-wt-boardSwap
    const oldSwap = localStorage.getItem('wt_swap_pref');
    if (oldSwap !== null) {
        if (localStorage.getItem(_scopeKey('wt', 'boardSwap')) === null) {
            localStorage.setItem(_scopeKey('wt', 'boardSwap'), oldSwap);
        }
        localStorage.removeItem('wt_swap_pref');
    }

    // Migrate old global audio/sfx keys
    const oldAudio = localStorage.getItem('setting-global-audio');
    if (oldAudio !== null) {
        if (localStorage.getItem(_globalKey('globalAudio')) === null) {
            localStorage.setItem(_globalKey('globalAudio'), oldAudio);
        }
        localStorage.removeItem('setting-global-audio');
    }

    const oldSfx = localStorage.getItem('setting-sfx');
    if (oldSfx !== null) {
        if (localStorage.getItem(_globalKey('sfx')) === null) {
            localStorage.setItem(_globalKey('sfx'), oldSfx);
        }
        localStorage.removeItem('setting-sfx');
    }
}

// --- Public API ---

export function get(scope, key) {
    _migrateOnce();
    const raw = localStorage.getItem(_scopeKey(scope, key));
    if (raw !== null) return _coerce(raw);
    return SCOPE_DEFAULTS[scope]?.[key] ?? null;
}

export function set(scope, key, value) {
    _migrateOnce();
    localStorage.setItem(_scopeKey(scope, key), _serialize(value));
    window.dispatchEvent(new CustomEvent('settings:changed', {
        detail: { scope, key, value }
    }));
}

export function getGlobal(key) {
    _migrateOnce();
    const raw = localStorage.getItem(_globalKey(key));
    if (raw !== null) return _coerce(raw);
    return GLOBAL_DEFAULTS[key] ?? null;
}

export function setGlobal(key, value) {
    _migrateOnce();
    localStorage.setItem(_globalKey(key), _serialize(value));
    window.dispatchEvent(new CustomEvent('settings:changed', {
        detail: { scope: 'global', key, value }
    }));
}

/**
 * Reset a single scope to its defaults.
 * Fires individual settings:changed events so existing listeners react.
 */
export function resetScope(scope) {
    const defaults = SCOPE_DEFAULTS[scope];
    if (!defaults) return;
    for (const [key, value] of Object.entries(defaults)) {
        localStorage.setItem(_scopeKey(scope, key), _serialize(value));
        window.dispatchEvent(new CustomEvent('settings:changed', {
            detail: { scope, key, value }
        }));
    }
    // WT boardSwap is not in SCOPE_DEFAULTS — handle explicitly
    if (scope === 'wt') {
        localStorage.setItem(_scopeKey('wt', 'boardSwap'), 'false');
        window.dispatchEvent(new CustomEvent('settings:changed', {
            detail: { scope: 'wt', key: 'boardSwap', value: false }
        }));
    }
}

/**
 * Reset all global settings to defaults.
 */
export function resetGlobals() {
    for (const [key, value] of Object.entries(GLOBAL_DEFAULTS)) {
        localStorage.setItem(_globalKey(key), _serialize(value));
        window.dispatchEvent(new CustomEvent('settings:changed', {
            detail: { scope: 'global', key, value }
        }));
    }
}

export function resetAll() {
    for (const scope of SCOPES) {
        for (const [key, value] of Object.entries(SCOPE_DEFAULTS[scope])) {
            localStorage.setItem(_scopeKey(scope, key), _serialize(value));
        }
    }

    for (const [key, value] of Object.entries(GLOBAL_DEFAULTS)) {
        localStorage.setItem(_globalKey(key), _serialize(value));
    }

    // Reset WT boardSwap
    localStorage.setItem(_scopeKey('wt', 'boardSwap'), 'false');

    window.dispatchEvent(new CustomEvent('settings:changed', { detail: { scope: 'all' } }));
}

/**
 * Detect current scope from active page.
 */
export function detectScope() {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return 'bb';
    const page = activePage.dataset.page || '';
    if (page.startsWith('broadcast')) return 'bc';
    if (page.startsWith('walkie-typie')) return 'wt';
    if (page.startsWith('mods')) return 'mods';
    return 'bb';
}

// Run migration immediately on import
_migrateOnce();
