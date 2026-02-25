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

// --- Shared Config Helpers (exported for WT/BC config pages) ---

export function createRangeControl(container, scope, key, labelKey, min, max, step = 1) {
    const item = document.createElement('div');
    item.className = 'misc-list-item';

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
    range.value = Settings.get(scope, key);

    const valueSpan = document.createElement('span');
    valueSpan.className = 'misc-range-value crt-text-green';
    valueSpan.textContent = range.value;

    range.addEventListener('input', () => {
        valueSpan.textContent = range.value;
        Settings.set(scope, key, parseInt(range.value));
    });
    range.addEventListener('change', () => {
        playAudio('UIGeneralFocus.mp3');
    });

    group.appendChild(range);
    group.appendChild(valueSpan);
    item.appendChild(label);
    item.appendChild(group);
    container.appendChild(item);

    return { range, valueSpan };
}

export function createToggleControl(container, scope, key, labelKey) {
    const item = document.createElement('div');
    item.className = 'misc-list-item';

    const label = document.createElement('div');
    label.className = 'misc-label';
    label.setAttribute('data-i18n', labelKey);
    label.textContent = t(labelKey);

    const btn = document.createElement('button');
    btn.className = 'misc-toggle-btn crt-text-green';

    function updateLabel() {
        const val = Settings.get(scope, key);
        btn.textContent = val ? t('mods.enabled') : t('mods.disabled');
    }
    updateLabel();

    btn.addEventListener('click', () => {
        playAudio('UISelectOn.mp3');
        const current = Settings.get(scope, key);
        Settings.set(scope, key, !current);
        updateLabel();
    });

    item.appendChild(label);
    item.appendChild(btn);
    container.appendChild(item);

    return { btn, updateLabel };
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
            maxSlot: createRangeControl(container, 'bb', 'maxSlot', 'config.maxSlotLabel', 10, 100, 10),
            maxFiles: createRangeControl(container, 'bb', 'maxFiles', 'config.maxFilesLabel', 1, 20, 1),
            autoClean: createToggleControl(container, 'bb', 'autoCleanBlanks', 'config.autoCleanBlanks'),
            updateTs: createToggleControl(container, 'bb', 'updateTimestamp', 'config.updateTimestamp'),
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

        // Reset button
        if (this.elements.resetBtn) {
            new MultiStepButton(this.elements.resetBtn, {
                sound: 'UIGeneralCancel.mp3',
                action: async () => {
                    Settings.resetAll();
                    BBMessage.info(t('config.resetComplete'));
                    this.renderBBConfig();
                    this.updateUI();
                }
            });
        }
    }
};

MISC.init();
window.addEventListener('i18n:ready', () => {
    MISC.renderBBConfig();
    MISC.updateUI();
});
