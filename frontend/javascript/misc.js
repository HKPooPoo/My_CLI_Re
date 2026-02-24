/**
 * MISC & Settings Controller
 * =================================================================
 * Responsibilities:
 * 1. Manage UI togglers for system settings (Language, Audio, SFX).
 * 2. Persist settings to localStorage.
 * 3. Support multi-state cycling for togglers.
 * =================================================================
 */

import { setLocale, getActiveLocale, t } from './i18n.js';
import { playAudio } from './audio.js';

export const MISC = {
    elements: {
        langBtn: document.getElementById('misc-toggle-lang'),
        globalAudioBtn: document.getElementById('misc-toggle-global-audio'),
        sfxBtn: document.getElementById('misc-toggle-sfx'),
        maxSlotRange: document.getElementById('misc-range-max-slot'),
        maxSlotValue: document.getElementById('misc-range-max-slot-value')
    },

    configs: {
        locale: ['default', 'zh-TW', 'en'],
        globalAudio: ['100', '0', '50'],
        sfx: ['100', '0', '50']
    },

    init() {
        if (!this.elements.langBtn) return;
        this.updateUI();
        this.bindEvents();
    },

    updateUI() {
        // Lang
        const currentLocale = getActiveLocale();
        this.elements.langBtn.textContent = t('misc.localeName');

        // Global Audio
        const currentAudio = localStorage.getItem('setting-global-audio') || '100';
        this.elements.globalAudioBtn.textContent = currentAudio + '%';

        // SFX
        const currentSfx = localStorage.getItem('setting-sfx') || '100';
        this.elements.sfxBtn.textContent = currentSfx + '%';

        // MAX SLOT
        const currentMaxSlot = localStorage.getItem('setting-max-slot') || '10';
        if (this.elements.maxSlotRange) this.elements.maxSlotRange.value = currentMaxSlot;
        if (this.elements.maxSlotValue) this.elements.maxSlotValue.textContent = currentMaxSlot;
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
            const current = localStorage.getItem('setting-global-audio') || '100';
            let index = this.configs.globalAudio.indexOf(current);
            if (index === -1) index = 0;
            const next = this.configs.globalAudio[(index + 1) % this.configs.globalAudio.length];
            localStorage.setItem('setting-global-audio', next);
            this.updateUI();
        });

        this.elements.sfxBtn.addEventListener('click', () => {
            playAudio('UISelectOff.mp3');
            const current = localStorage.getItem('setting-sfx') || '100';
            let index = this.configs.sfx.indexOf(current);
            if (index === -1) index = 0;
            const next = this.configs.sfx[(index + 1) % this.configs.sfx.length];
            localStorage.setItem('setting-sfx', next);
            this.updateUI();
        });

        this.elements.maxSlotRange?.addEventListener('input', () => {
            const val = this.elements.maxSlotRange.value;
            if (this.elements.maxSlotValue) this.elements.maxSlotValue.textContent = val;
            localStorage.setItem('setting-max-slot', val);
            window.dispatchEvent(new CustomEvent('settings:maxSlotChanged'));
        });
        this.elements.maxSlotRange?.addEventListener('change', () => {
            playAudio('UIGeneralFocus.mp3');
        });
    }
};

MISC.init();
window.addEventListener('i18n:ready', () => MISC.updateUI());
