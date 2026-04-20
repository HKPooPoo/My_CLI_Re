/**
 * Walkie-Typie Config Page
 * =================================================================
 * Renders WT-specific settings using shared helpers from misc.js.
 * =================================================================
 */

import { createRangeControl, createToggleControl, createResetButton } from './misc.js';
import { t } from './i18n.js';
import * as Settings from './settings.js';

const WTConfig = {
    container: document.getElementById('wt-config-container'),
    controls: null,

    init() {
        this.render();
        const action = document.getElementById('wt-config-action');
        if (action) {
            createResetButton(action, 'wt', () => this.render());
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
            maxSlot: createRangeControl(this.container, 'wt', 'maxSlot', 'config.maxSlotLabel', 10, 100, 10, 'hints.config.maxSlot'),
            maxFiles: createRangeControl(this.container, 'wt', 'maxFiles', 'config.maxFilesLabel', 1, 20, 1, 'hints.config.maxFiles'),
            autoClean: createToggleControl(this.container, 'wt', 'autoCleanBlanks', 'config.autoCleanBlanks', 'hints.config.autoCleanBlanks'),
            updateTs: createToggleControl(this.container, 'wt', 'updateTimestamp', 'config.updateTimestamp', 'hints.config.updateTimestamp'),
            boardSwap: createToggleControl(this.container, 'wt', 'boardSwap', 'config.boardSwap', 'hints.config.boardSwap'),
            loopList: createToggleControl(this.container, 'wt', 'loopList', 'config.loopList', 'hints.config.loopList'),
            notifications: createToggleControl(this.container, 'wt', 'notifications', 'config.notifications', 'hints.config.notifications'),
        };
    }
};

WTConfig.init();
