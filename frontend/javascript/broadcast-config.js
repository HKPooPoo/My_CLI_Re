/**
 * Broadcast Config Page
 * =================================================================
 * Renders BC-specific settings using shared helpers from misc.js.
 * =================================================================
 */

import { createResetButton } from './misc.js';
import { t } from './i18n.js';
import * as Settings from './settings.js';

const BCConfig = {
    container: document.getElementById('bc-config-container'),
    controls: null,

    init() {
        this.render();
        const action = document.getElementById('bc-config-action');
        if (action) {
            createResetButton(action, 'bc', () => this.render());
        }
        window.addEventListener('i18n:ready', () => this.render());
        window.addEventListener('settings:changed', (e) => {
            if (e.detail?.scope === 'all') this.render();
        });
    },

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        // Tier 18: BC has no remaining per-scope settings once the
        // global knobs retire. Config page is intentionally empty —
        // the MISC page-scope / global config still covers the project.
        this.controls = {};
    }
};

BCConfig.init();
