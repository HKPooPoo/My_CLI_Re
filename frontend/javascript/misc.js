/**
 * MISC & Settings Controller
 * =================================================================
 * Responsibilities:
 * 1. Manage UI togglers for system settings (Language, Audio, SFX).
 * 2. BB-specific settings (Max Entries, Max Files, Auto-Clean, Timestamp).
 * 3. Export shared helpers for WT/BC config pages.
 * =================================================================
 */

import { t } from './i18n.js';
import { playAudio } from './audio.js';
import * as Settings from './settings.js';
import { MultiStepButton } from './multiStepButton.js';
import { BBMessage } from './blackboard-msg.js';
import { PLATFORM_VERSION } from './version.js';
import toastMessager from './toast.js';

// --- Shared Config Helpers (exported for WT/BC config pages) ---

export function createRangeControl(container, scope, key, labelKey, min, max, step = 1, hintKey, formatter) {
    const item = document.createElement('div');
    item.className = 'misc-list-item';
    if (hintKey) item.dataset.hint = hintKey;

    const label = document.createElement('div');
    label.className = 'misc-label';
    label.setAttribute('data-i18n', labelKey);
    label.textContent = t(labelKey);

    const group = document.createElement('div');
    group.className = 'misc-range-group';

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'misc-range-input';
    range.min = min;
    range.max = max;
    range.step = step;
    range.value = scope === 'global' ? Settings.getGlobal(key) : Settings.get(scope, key);

    const valueSpan = document.createElement('span');
    valueSpan.className = 'misc-range-value crt-text-green';
    valueSpan.textContent = formatter ? formatter(parseInt(range.value)) : range.value;

    range.addEventListener('input', () => {
        const v = parseInt(range.value);
        valueSpan.textContent = formatter ? formatter(v) : v;
        if (scope === 'global') Settings.setGlobal(key, v);
        else Settings.set(scope, key, v);
    });
    range.addEventListener('change', () => {
        playAudio('UIGeneralFocus.mp3');
    });

    group.appendChild(range);
    group.appendChild(valueSpan);
    item.appendChild(label);
    item.appendChild(group);
    container.appendChild(item);

    return { range, valueSpan, formatter };
}

export function createToggleControl(container, scope, key, labelKey, hintKey) {
    const item = document.createElement('div');
    item.className = 'misc-list-item';

    const label = document.createElement('div');
    label.className = 'misc-label';
    label.setAttribute('data-i18n', labelKey);
    label.textContent = t(labelKey);

    if (hintKey) item.dataset.hint = hintKey;

    const btn = document.createElement('button');
    btn.className = 'misc-toggle-btn crt-text-green';

    function updateLabel() {
        const val = scope === 'global' ? Settings.getGlobal(key) : Settings.get(scope, key);
        btn.textContent = val ? t('mods.enabled') : t('mods.disabled');
    }
    updateLabel();

    btn.addEventListener('click', () => {
        playAudio('UISelectOn.mp3');
        const current = scope === 'global' ? Settings.getGlobal(key) : Settings.get(scope, key);
        if (scope === 'global') Settings.setGlobal(key, !current);
        else Settings.set(scope, key, !current);
        updateLabel();
    });

    item.appendChild(label);
    item.appendChild(btn);
    container.appendChild(item);

    return { btn, updateLabel };
}

/**
 * Create a scope-specific reset button.
 * @param {HTMLElement} parentContainer - The .misc-container parent (button appended here)
 * @param {string} scope - The settings scope to reset ('bb', 'wt', 'bc', 'mods')
 * @param {() => void} [onReset] - Extra callback after reset (e.g. re-render)
 */
export function createResetButton(parentContainer, scope, onReset) {
    const btn = document.createElement('button');
    btn.className = 'misc-toggle-btn crt-text-orange';
    // No inline width/margin — parent (.misc-action-container) uses its
    // own flex gap + default cross-axis stretch to size the button, and
    // clips any horizontal .misc-toggle-btn margin overflow via its own
    // overflow-x: hidden.
    btn.setAttribute('data-i18n', 'config.reset');
    btn.setAttribute('data-hint', 'hints.resetConfig');
    btn.textContent = t('config.reset');
    parentContainer.appendChild(btn);

    new MultiStepButton(btn, {
        sound: 'UIGeneralCancel.mp3',
        steps: 3,
        action: async () => {
            Settings.resetScope(scope);
            BBMessage.success(t('config.resetComplete'));
            if (onReset) onReset();
        }
    });

    return btn;
}

// --- MISC Controller ---

export const MISC = {
    elements: {
        globalAudioBtn: document.getElementById('misc-toggle-global-audio'),
        sfxBtn: document.getElementById('misc-toggle-sfx'),
        bbConfigContainer: document.getElementById('bb-config-container'),
        clearToastBtn: document.getElementById('misc-clear-toast-btn'),
        resetBtn: document.getElementById('misc-reset-btn'),
        wipeLocalBtn: document.getElementById('misc-wipe-local-btn'),
        dropAllBranchesBtn: document.getElementById('misc-drop-all-branches-btn'),
        installAppBtn: document.getElementById('misc-install-app-btn'),
        initDataBtn: document.getElementById('misc-init-data-btn'),
    },

    configs: {
        globalAudio: ['100', '0', '50'],
        sfx: ['100', '0', '50']
    },

    bbControls: null,

    init() {
        if (!this.elements.globalAudioBtn) return;
        this.renderBBConfig();
        this.updateUI();
        this.bindEvents();
    },

    renderBBConfig() {
        const container = this.elements.bbConfigContainer;
        if (!container) return;
        container.innerHTML = '';

        this.bbControls = {
            maxSlot: createRangeControl(container, 'bb', 'maxSlot', 'config.maxSlotLabel', 10, 100, 10, 'hints.config.maxSlot'),
            maxFiles: createRangeControl(container, 'bb', 'maxFiles', 'config.maxFilesLabel', 1, 20, 1, 'hints.config.maxFiles'),
            autoClean: createToggleControl(container, 'bb', 'autoCleanBlanks', 'config.autoCleanBlanks', 'hints.config.autoCleanBlanks'),
            updateTs: createToggleControl(container, 'bb', 'updateTimestamp', 'config.updateTimestamp', 'hints.config.updateTimestamp'),
            autoSync: createToggleControl(container, 'bb', 'autoSync', 'config.autoSync', 'hints.config.autoSync'),
            loopList: createToggleControl(container, 'bb', 'loopList', 'config.loopList', 'hints.config.loopList'),
            showHints: createToggleControl(container, 'global', 'showHints', 'config.showHints', 'hints.config.showHints'),
            screensaverTimeout: createRangeControl(container, 'global', 'screensaverTimeout', 'config.screensaverTimeout', 10, 310, 10, 'hints.config.screensaverTimeout',
                (v) => v >= 310 ? t('mods.disabled') : v),
        };
    },

    updateUI() {
        // Global Audio
        const currentAudio = String(Settings.getGlobal('globalAudio'));
        this.elements.globalAudioBtn.textContent = currentAudio + '%';

        // SFX
        const currentSfx = String(Settings.getGlobal('sfx'));
        this.elements.sfxBtn.textContent = currentSfx + '%';

        // BB config controls
        if (this.bbControls) {
            this.bbControls.maxSlot.range.value = Settings.get('bb', 'maxSlot');
            this.bbControls.maxSlot.valueSpan.textContent = Settings.get('bb', 'maxSlot');
            this.bbControls.maxFiles.range.value = Settings.get('bb', 'maxFiles');
            this.bbControls.maxFiles.valueSpan.textContent = Settings.get('bb', 'maxFiles');
            this.bbControls.autoClean.updateLabel();
            this.bbControls.updateTs.updateLabel();
            this.bbControls.autoSync?.updateLabel();
            this.bbControls.loopList?.updateLabel();
            this.bbControls.showHints?.updateLabel();
            if (this.bbControls.screensaverTimeout) {
                const v = Settings.getGlobal('screensaverTimeout');
                const fmt = this.bbControls.screensaverTimeout.formatter;
                this.bbControls.screensaverTimeout.range.value = v;
                this.bbControls.screensaverTimeout.valueSpan.textContent = fmt ? fmt(v) : v;
            }
        }
    },

    bindEvents() {
        this.elements.globalAudioBtn.addEventListener('click', () => {
            playAudio('UISelectOn.mp3');
            const current = String(Settings.getGlobal('globalAudio'));
            let index = this.configs.globalAudio.indexOf(current);
            if (index === -1) index = 0;
            const next = this.configs.globalAudio[(index + 1) % this.configs.globalAudio.length];
            Settings.setGlobal('globalAudio', next);
            this.updateUI();
        });

        this.elements.sfxBtn.addEventListener('click', () => {
            playAudio('UISelectOff.mp3');
            const current = String(Settings.getGlobal('sfx'));
            let index = this.configs.sfx.indexOf(current);
            if (index === -1) index = 0;
            const next = this.configs.sfx[(index + 1) % this.configs.sfx.length];
            Settings.setGlobal('sfx', next);
            this.updateUI();
        });

        // Clear toast button
        if (this.elements.clearToastBtn) {
            this.elements.clearToastBtn.addEventListener('click', () => {
                playAudio('UISelectOff.mp3');
                toastMessager.clearAll();
            });
        }

        // PWA install trigger — always visible (no hide when installed, per
        // user preference). pwa.js's helper handles the installed / iOS /
        // prompt-unavailable branches with toasts.
        if (this.elements.installAppBtn) {
            new MultiStepButton(this.elements.installAppBtn, {
                sound: 'UIGeneralOK.mp3',
                action: async () => {
                    const { triggerInstallFromMisc } = await import('./pwa.js');
                    await triggerInstallFromMisc();
                }
            });
        }

        // INITIALIZE WEBSITE DATA — clear every local surface (Cache API,
        // Service Worker, IndexedDB, local/session storage) then reload,
        // returning the device to a first-visit baseline. Cookies are
        // untouched (laravel_session is HttpOnly, inaccessible from JS) —
        // server session survives, user stays logged in via /auth/status
        // re-hydrate. 3-step confirm — loses every local-only thing:
        // settings, MOD instances, language choice, unposted drafts.
        // Clear order: caches → SW → IndexedDB → web storage → reload,
        // so the reload's fetches pass through to the server without any
        // middleware intercepting.
        if (this.elements.initDataBtn) {
            new MultiStepButton(this.elements.initDataBtn, {
                sound: 'UISelectOff.mp3',
                steps: 3,
                action: async () => {
                    const msg = BBMessage.loading(t('misc.initializingWebsiteData'));
                    try {
                        // (1) Cache API — wipes Workbox precache + runtime-swr + legacy
                        const cacheNames = await caches.keys();
                        await Promise.all(cacheNames.map(n => caches.delete(n)));

                        // (2) Service Worker — unregister ALL registrations
                        const regs = await navigator.serviceWorker.getRegistrations();
                        await Promise.all(regs.map(r => r.unregister()));

                        // (3) IndexedDB — deleteDatabase is stronger than
                        // per-table .clear(); resets schema + version so
                        // migrations replay clean on next boot.
                        const dbMod = await import('./indexedDB.js');
                        dbMod.default.close();
                        await new Promise(resolve => {
                            const req = indexedDB.deleteDatabase(dbMod.default.name);
                            req.onsuccess = req.onerror = req.onblocked = () => resolve();
                        });

                        // (4) Web Storage — user wants "like never accessed"
                        localStorage.clear();
                        sessionStorage.clear();

                        msg.update(t('misc.initializeWebsiteDataComplete'));
                        setTimeout(() => window.location.reload(), 500);
                    } catch (e) {
                        console.error('Initialize website data failed:', e);
                        msg.close();
                        BBMessage.error(t('misc.initializeWebsiteDataFailed'));
                    }
                }
            });
        }

        // Reset button — BB scope + globals (everything visible on this page)
        if (this.elements.resetBtn) {
            new MultiStepButton(this.elements.resetBtn, {
                sound: 'UIGeneralCancel.mp3',
                steps: 3,
                action: async () => {
                    Settings.resetScope('bb');
                    Settings.resetGlobals();
                    BBMessage.success(t('config.resetComplete'));
                    this.renderBBConfig();
                    this.updateUI();
                }
            });
        }

        // DANGER ZONE — wipe all local IndexedDB (BB branches, WT records,
        // BC channels/boards, file_blobs). Server data untouched. Page reloads
        // so fresh state loads without stale in-memory references.
        if (this.elements.wipeLocalBtn) {
            new MultiStepButton(this.elements.wipeLocalBtn, {
                sound: 'UISelectOff.mp3',
                steps: 3,
                action: async () => {
                    try {
                        const db = (await import('./indexedDB.js')).default;
                        await Promise.all([
                            db.blackboard.clear(),
                            db.walkie_typie.clear(),
                            db.broadcast_channels.clear(),
                            db.broadcast_boards.clear(),
                            db.file_blobs.clear(),
                        ]);
                        BBMessage.success(t('misc.wipeLocalComplete'));
                        // Reload so all modules pick up the empty state
                        setTimeout(() => window.location.reload(), 500);
                    } catch (e) {
                        console.error('Wipe local failed:', e);
                        BBMessage.error(t('misc.wipeLocalFailed'));
                    }
                }
            });
        }

        // DANGER ZONE — drop all of the user's BB branches from the server.
        // Requires login. Local IndexedDB untouched; the next commit of each
        // branch would re-create it on the server.
        if (this.elements.dropAllBranchesBtn) {
            new MultiStepButton(this.elements.dropAllBranchesBtn, {
                sound: 'UISelectOff.mp3',
                steps: 3,
                action: async () => {
                    if (!localStorage.getItem('currentUser')) {
                        BBMessage.requireLogin();
                        return;
                    }
                    const { BlackboardService } = await import('./services/blackboard-service.js');
                    const msg = BBMessage.loading(t('misc.dropAllBranchesPending'));
                    try {
                        const result = await BlackboardService.deleteAllBranches();
                        msg.update(t('misc.dropAllBranchesComplete', { count: result?.count ?? 0 }));
                    } catch (e) {
                        msg.close();
                        console.error('Drop all branches failed:', e);
                        BBMessage.error(e.message || t('misc.dropAllBranchesFailed'));
                    }
                }
            });
        }
    }
};

MISC.init();

window.addEventListener('i18n:ready', () => {
    MISC.renderBBConfig();
    MISC.updateUI();

    // Display platform version
    const versionEl = document.getElementById('platform-version');
    if (versionEl) versionEl.textContent = `My CLI Re v${PLATFORM_VERSION}`;
});
