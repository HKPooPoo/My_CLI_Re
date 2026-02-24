/**
 * Feature - Markdown Preview (MOD)
 * =================================================================
 * Renders Markdown content in the feature shelf panel.
 * Only active when the 'markdown-preview' MOD is enabled.
 * Uses the global `marked` library (loaded via vendor script).
 * =================================================================
 */

import { ModState } from './mod-state.js';

const $mdOutput = document.getElementById('feature-markdown-output');
const $mdBtn = document.querySelector('[data-feature-btn="markdown-preview"]');

let _debounceTimer = null;
let _activeTextarea = null;

/**
 * Get the currently visible textarea based on active page.
 */
function getActiveTextarea() {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return null;

    const page = activePage.dataset.page;
    if (page === 'blackboard-log') return document.getElementById('log-textarea');
    if (page === 'broadcast-channel') return document.getElementById('channel-textarea');
    return null;
}

/**
 * Render markdown text into the output div.
 */
function renderMarkdown(text) {
    if (!$mdOutput) return;
    if (!text || !text.trim()) {
        $mdOutput.innerHTML = '<div class="md-empty">NO CONTENT</div>';
        return;
    }

    try {
        // marked is loaded globally via vendor script
        if (typeof marked !== 'undefined') {
            $mdOutput.innerHTML = marked.parse(text, { breaks: true, gfm: true });
        } else {
            $mdOutput.textContent = text;
        }
    } catch (e) {
        console.error('Markdown render failed:', e);
        $mdOutput.textContent = text;
    }
}

/**
 * Debounced update handler for textarea input.
 */
function onTextareaInput() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
        if (!ModState.isEnabled('markdown-preview')) return;
        const textarea = getActiveTextarea();
        if (textarea) renderMarkdown(textarea.value);
    }, 300);
}

/**
 * Attach/detach input listener to the current textarea.
 */
function bindTextarea() {
    const textarea = getActiveTextarea();
    if (_activeTextarea === textarea) return;

    // Detach old
    if (_activeTextarea) {
        _activeTextarea.removeEventListener('input', onTextareaInput);
    }

    _activeTextarea = textarea;

    // Attach new
    if (_activeTextarea) {
        _activeTextarea.addEventListener('input', onTextareaInput);
        // Initial render
        if (ModState.isEnabled('markdown-preview')) {
            renderMarkdown(_activeTextarea.value);
        }
    }
}

// --- Feature button click: render immediately ---
$mdBtn?.addEventListener('click', () => {
    if (!ModState.isEnabled('markdown-preview')) {
        if ($mdOutput) $mdOutput.innerHTML = '<div class="md-empty">MOD DISABLED</div>';
        return;
    }
    bindTextarea();
    const textarea = getActiveTextarea();
    if (textarea) renderMarkdown(textarea.value);
});

// --- Page change: rebind textarea ---
window.addEventListener('navi:pageChanged', () => {
    bindTextarea();
});

// --- MOD state change: show/hide button ---
window.addEventListener('mods:changed', (e) => {
    if (e.detail?.modId === 'markdown-preview') {
        if (!e.detail.enabled && $mdOutput) {
            $mdOutput.innerHTML = '';
        }
    }
});
