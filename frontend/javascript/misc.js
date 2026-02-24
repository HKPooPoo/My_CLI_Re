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
        maxSlotBtn: document.getElementById('misc-toggle-max-slot')
    },

    configs: {
        locale: ['en', 'zh-TW'],
        globalAudio: ['100', '0', '50'],
        sfx: ['100', '0', '50'],
        maxSlot: ['10', '20', '50', '100']
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
        if (this.elements.maxSlotBtn) this.elements.maxSlotBtn.textContent = currentMaxSlot;
    },

    bindEvents() {
        this.elements.langBtn.addEventListener('click', async () => {
            playAudio('UIGeneralFocus.mp3');
            const nextLocale = getActiveLocale() === 'en' ? 'zh-TW' : 'en';
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

        this.elements.maxSlotBtn?.addEventListener('click', () => {
            playAudio('UIGeneralFocus.mp3');
            const current = localStorage.getItem('setting-max-slot') || '10';
            let index = this.configs.maxSlot.indexOf(current);
            if (index === -1) index = 0;
            const next = this.configs.maxSlot[(index + 1) % this.configs.maxSlot.length];
            localStorage.setItem('setting-max-slot', next);
            this.updateUI();
            window.dispatchEvent(new CustomEvent('settings:maxSlotChanged'));
        });
    }
};

MISC.init();
window.addEventListener('i18n:ready', () => MISC.updateUI());
