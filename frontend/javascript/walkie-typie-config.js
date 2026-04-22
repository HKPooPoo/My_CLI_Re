/**
 * Walkie-Typie Config Page
 * =================================================================
 * Renders WT-specific settings using shared helpers from misc.js.
 * =================================================================
 */

import { createToggleControl, createResetButton } from './misc.js';
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

        // Tier 18: retired maxSlot / maxFiles / autoCleanBlanks /
        // updateTimestamp / loopList. WT keeps boardSwap (layout
        // preference) and notifications (system notification gate).
        this.controls = {
            boardSwap: createToggleControl(this.container, 'wt', 'boardSwap', 'config.boardSwap', 'hints.config.boardSwap'),
            notifications: createToggleControl(this.container, 'wt', 'notifications', 'config.notifications', 'hints.config.notifications'),
        };
    }
};

WTConfig.init();
