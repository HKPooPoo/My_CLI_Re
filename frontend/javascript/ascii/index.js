/**
 * ASCII animation bootstrap.
 *
 * Ports two layers from the pre-Tier-8 MOD system's ascii-animator:
 *   - shelf-spinner: injects rotating / - \ | into textareas whose
 *     `data-loading="true"` attribute is set.
 *   - toast-spinner: prepends animated braille frames to loading
 *     toasts inside #toast-container.
 *
 * Both are purely additive — they hook on a passive MutationObserver
 * against the existing `data-loading` convention (documented in
 * CLAUDE.md). Nothing else in the app needs to change.
 *
 * WebGL-dependent layers (matrix-rain / perlin-bg) are not ported —
 * unnecessary for the classroom-scenario demo and would re-introduce
 * the textmode.js boot dependency we pruned.
 */

import { createShelfSpinner } from './shelf-spinner.js';
import { createToastSpinner } from './toast-spinner.js';

function boot() {
    createShelfSpinner();
    createToastSpinner();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
    boot();
}
