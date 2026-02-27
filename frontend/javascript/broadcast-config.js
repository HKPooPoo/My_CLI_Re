/**
 * Broadcast Config Page
 * =================================================================
 * Renders BC-specific settings using shared helpers from misc.js.
 * =================================================================
 */

import { createRangeControl, createToggleControl } from './misc.js';
import { t } from './i18n.js';
import * as Settings from './settings.js';

const BCConfig = {
    container: document.getElementById('bc-config-container'),
    controls: null,

    init() {
        this.render();
        window.addEventListener('i18n:ready', () => this.render());
        window.addEventListener('settings:changed', (e) => {
            if (e.detail?.scope === 'all') this.render();
        });
    },

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        this.controls = {
            maxSlot: createRangeControl(this.container, 'bc', 'maxSlot', 'config.maxSlotLabel', 10, 100, 10, 'hints.config.maxSlot'),
            maxFiles: createRangeControl(this.container, 'bc', 'maxFiles', 'config.maxFilesLabel', 1, 20, 1),
            autoClean: createToggleControl(this.container, 'bc', 'autoCleanBlanks', 'config.autoCleanBlanks', 'hints.config.autoCleanBlanks'),
            updateTs: createToggleControl(this.container, 'bc', 'updateTimestamp', 'config.updateTimestamp', 'hints.config.updateTimestamp'),
        };
    }
};

BCConfig.init();
