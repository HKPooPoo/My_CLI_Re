/**
 * Mods MISC Page
 * =================================================================
 * Renders MOD-section settings using shared helpers from misc.js.
 * =================================================================
 */

import { createToggleControl, createResetButton } from './misc.js';

const ModsMisc = {
    container: document.getElementById('mods-misc-container'),
    controls: null,

    init() {
        this.render();
        if (this.container) {
            createResetButton(this.container.parentElement, 'mods', () => this.render());
        }
        window.addEventListener('i18n:ready', () => this.render());
        window.addEventListener('settings:changed', (e) => {
            if (e.detail?.scope === 'all') this.render();
        });
    },

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.controls = {
            loopList: createToggleControl(this.container, 'mods', 'loopList', 'config.loopList', 'hints.config.loopList'),
        };
    }
};

ModsMisc.init();
