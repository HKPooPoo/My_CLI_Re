/**
 * Hint Panel - Hover Hint for Buttons
 * =================================================================
 * Shows a frosted glass panel covering navi + sub-navi area when
 * hovering over any element with a [data-hint] attribute.
 * The data-hint value is an i18n key (e.g. "hints.push").
 * Controlled by the global 'showHints' setting.
 * =================================================================
 */

import { t } from './i18n.js';
import * as Settings from './settings.js';

const body = document.querySelector('.body');
const panel = document.createElement('div');
panel.className = 'hint-panel frosted-glass';
body.insertBefore(panel, body.firstChild);

let enabled = Settings.getGlobal('showHints');

window.addEventListener('settings:changed', (e) => {
    if (e.detail.key === 'showHints') {
        enabled = e.detail.value;
        if (!enabled) panel.classList.remove('active');
    }
});

document.addEventListener('mouseenter', (e) => {
    if (!e.target.closest) return;
    const target = e.target.closest('[data-hint]');
    if (!target || !enabled) return;
    panel.textContent = t(target.dataset.hint);
    panel.classList.add('active');
}, true);

document.addEventListener('mouseleave', (e) => {
    if (!e.target.closest) return;
    const target = e.target.closest('[data-hint]');
    if (!target) return;
    panel.classList.remove('active');
}, true);
