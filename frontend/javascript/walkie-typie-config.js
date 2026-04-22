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

        // Tier 22: boardSwap ("MY SIDE FIRST") retired. WT config page
        // now only carries the system-notification gate; layout swap
        // remains as the in-session switch button but is not persisted.
        this.controls = {
            notifications: createToggleControl(this.container, 'wt', 'notifications', 'config.notifications', 'hints.config.notifications'),
        };
    }
};

WTConfig.init();
