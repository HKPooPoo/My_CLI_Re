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
        sfxBtn: document.getElementById('misc-toggle-sfx')
    },

    configs: {
        locale: ['en', 'zh-TW'],
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
    }
};

MISC.init();
