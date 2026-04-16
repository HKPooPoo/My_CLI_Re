/**
 * Timing Configuration Loader
 * =================================================================
 * Single source of truth for all debounce / polling / cache / toast
 * timings. Loads /api/config/timing once at app boot and exposes a
 * synchronous getter T(path) for use anywhere.
 *
 * Backend reads the same values from backend/config/timing.json via
 * Laravel's config('timing.*') helper. To tune the system, deployer
 * edits ONE file: backend/config/timing.json.
 *
 * Usage:
 *   import { loadTiming, T } from './timing.js';
 *   await loadTiming();                      // call once at app boot
 *   setTimeout(fn, T('frontend.input.bbSaveDebounce'));
 * =================================================================
 */

let _config = null;
let _loadPromise = null;

const FALLBACKS = {
    'frontend.input.bbSaveDebounce': 200,
    'frontend.input.wtWhisperDebounce': 20,
    'frontend.input.wtSaveDebounce': 200,
    'frontend.input.wtCommitDebounce': 2000,
    'frontend.input.bcSaveDebounce': 200,
    'frontend.background.bbAutoCommitDelay': 2000,
    'frontend.background.bbPollInterval': 2000,
    'frontend.background.hudHeartbeatInterval': 4000,
    'frontend.ui.listSelectionDebounce': 200,
    'frontend.ui.buttonStateDebounce': 20,
    'frontend.ui.scrollCooldownMin': 20,
    'frontend.ui.scrollCooldownMax': 80,
    'frontend.ui.subNaviCooldown': 200,
    'frontend.ui.crtGlitchDuration': 1200,
    'frontend.toast.infoDuration': 4000,
    'frontend.toast.successDuration': 4000,
    'frontend.toast.errorDuration': 6000,
    'frontend.toast.rateLimitDebounce': 4000,
    'frontend.timeout.apiDefault': 15000,
    'frontend.timeout.fileUpload': 60000,
    'frontend.timeout.blobUrlRevoke': 60000,
    'frontend.timeout.blobUrlRevokeOffline': 600000,
    'frontend.frontendCache.bcReaderCacheTTL': 4000,
};

/**
 * Load the timing config from the backend. Idempotent — safe to call
 * multiple times. Resolves once the config is in memory.
 */
export async function loadTiming() {
    if (_config) return _config;
    if (_loadPromise) return _loadPromise;

    _loadPromise = fetch('/api/config/timing')
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(c => {
            _config = c;
            return c;
        })
        .catch(err => {
            console.warn('[timing] Failed to load /api/config/timing — using fallback values:', err);
            _config = {}; // sentinel; T() will use FALLBACKS
            return _config;
        });

    return _loadPromise;
}

/**
 * Synchronous getter. Returns the value at the given dotted path, or a
 * sensible fallback if config not yet loaded or path missing.
 *
 * @param {string} path  e.g. 'frontend.input.bbSaveDebounce'
 * @returns {number}
 */
export function T(path) {
    if (_config) {
        const value = path.split('.').reduce((o, k) => o?.[k], _config);
        if (typeof value === 'number') return value;
    }
    if (path in FALLBACKS) return FALLBACKS[path];
    console.warn(`[timing] Unknown path "${path}" — returning 0`);
    return 0;
}
