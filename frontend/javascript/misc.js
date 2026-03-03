/**
 * MISC & Settings Controller
 * =================================================================
 * Responsibilities:
 * 1. Manage UI togglers for system settings (Language, Audio, SFX).
 * 2. BB-specific settings (Max Entries, Max Files, Auto-Clean, Timestamp).
 * 3. Export shared helpers for WT/BC config pages.
 * =================================================================
 */

import { setLocale, getActiveLocale, t } from './i18n.js';
import { playAudio } from './audio.js';
import * as Settings from './settings.js';
import { MultiStepButton } from './multiStepButton.js';
import { BBMessage } from './blackboard-msg.js';
import { PLATFORM_VERSION } from './version.js';

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
    btn.style.cssText = 'margin-top: 8px; width: 100%;';
    btn.setAttribute('data-i18n', 'config.reset');
    btn.textContent = t('config.reset');
    parentContainer.appendChild(btn);

    new MultiStepButton(btn, {
        sound: 'UIGeneralCancel.mp3',
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
        langBtn: document.getElementById('misc-toggle-lang'),
        globalAudioBtn: document.getElementById('misc-toggle-global-audio'),
        sfxBtn: document.getElementById('misc-toggle-sfx'),
        bbConfigContainer: document.getElementById('bb-config-container'),
        resetBtn: document.getElementById('misc-reset-btn'),
    },

    configs: {
        locale: ['default', 'zh-TW', 'en'],
        globalAudio: ['100', '0', '50'],
        sfx: ['100', '0', '50']
    },

    bbControls: null,

    init() {
        if (!this.elements.langBtn) return;
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
            maxFiles: createRangeControl(container, 'bb', 'maxFiles', 'config.maxFilesLabel', 1, 20, 1),
            autoClean: createToggleControl(container, 'bb', 'autoCleanBlanks', 'config.autoCleanBlanks', 'hints.config.autoCleanBlanks'),
            updateTs: createToggleControl(container, 'bb', 'updateTimestamp', 'config.updateTimestamp', 'hints.config.updateTimestamp'),
            autoSync: createToggleControl(container, 'bb', 'autoSync', 'config.autoSync', 'hints.config.autoSync'),
            loopList: createToggleControl(container, 'bb', 'loopList', 'config.loopList', 'hints.config.loopList'),
            showHints: createToggleControl(container, 'global', 'showHints', 'config.showHints'),
            screensaverTimeout: createRangeControl(container, 'global', 'screensaverTimeout', 'config.screensaverTimeout', 10, 310, 10, 'hints.config.screensaverTimeout',
                (v) => v >= 310 ? t('mods.disabled') : v),
            crtBlendMode: createToggleControl(container, 'global', 'crtBlendMode', 'config.crtBlendModeLabel', 'hints.config.crtBlendMode'),
        };
    },

    updateUI() {
        // Lang
        this.elements.langBtn.textContent = t('misc.localeName');

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
        this.elements.langBtn.addEventListener('click', async () => {
            playAudio('UIGeneralFocus.mp3');
            const current = getActiveLocale();
            const locales = this.configs.locale;
            let index = locales.indexOf(current);
            if (index === -1) index = 0;
            const nextLocale = locales[(index + 1) % locales.length];
            await setLocale(nextLocale);
            this.updateUI();
        });

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

        // Reset button — BB scope + globals (everything visible on this page)
        if (this.elements.resetBtn) {
            new MultiStepButton(this.elements.resetBtn, {
                sound: 'UIGeneralCancel.mp3',
                action: async () => {
                    Settings.resetScope('bb');
                    Settings.resetGlobals();
                    BBMessage.success(t('config.resetComplete'));
                    this.renderBBConfig();
                    this.updateUI();
                }
            });
        }
    }
};

MISC.init();

// --- CRT Blend Mode Effect ---
function applyCrtBlendMode(enabled) {
    const scanner = document.querySelector('.crt-scanner');
    if (scanner) scanner.style.mixBlendMode = enabled ? 'overlay' : '';
}
applyCrtBlendMode(Settings.getGlobal('crtBlendMode'));
window.addEventListener('settings:changed', ({ detail }) => {
    if (detail.key === 'crtBlendMode') applyCrtBlendMode(detail.value);
});

window.addEventListener('i18n:ready', () => {
    MISC.renderBBConfig();
    MISC.updateUI();

    // Display platform version
    const versionEl = document.getElementById('platform-version');
    if (versionEl) versionEl.textContent = `My CLI Re v${PLATFORM_VERSION}`;
});
