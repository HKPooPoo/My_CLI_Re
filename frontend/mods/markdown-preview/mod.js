/**
 * Markdown Preview MOD - Renders Markdown in feature shelf
 * =================================================================
 * Uses the global `marked` library (loaded via vendor script).
 * Page-aware: binds to the active textarea and renders on input.
 * =================================================================
 */

import { ModState } from '../../javascript/mod-state.js';
import { t } from '../../javascript/i18n.js';

let _debounceTimer = null;
let _activeTextarea = null;
let _outputEl = null;

export default {
    // --- Identity ---
    id: 'markdown-preview',
    group: 'utilities',
    nameKey: 'mods.markdownPreview.name',
    descriptionKey: 'mods.markdownPreview.desc',
    defaultEnabled: true,

    // --- Feature integration ---
    featureButtons: [
        { id: 'markdown-preview', labelKey: 'mods.markdownPreview.btn' },
    ],
    shelfPanelId: 'markdown-preview',

    // --- Page awareness ---
    pages: {
        'blackboard-log':    { textareaSelector: '#log-textarea' },
        'broadcast-channel': { textareaSelector: '#channel-textarea' },
    },

    // --- Provider & Config ---
    providers: [
        { id: 'marked', type: 'client', nameKey: 'mods.markdownPreview.provider.marked' },
    ],
    configSchema: [],
    sharedConfigGroup: null,

    // --- Lifecycle ---
    async init(ctx) {
        // Create output div inside shelf panel
        const shelf = document.querySelector('[data-feature-shelf="markdown-preview"]');
        if (shelf) {
            const output = document.createElement('div');
            output.id = 'feature-markdown-output';
            output.className = 'markdown-rendered';
            shelf.appendChild(output);
            _outputEl = output;
        }

        // Listen for page changes to rebind textarea
        window.addEventListener('navi:pageChanged', () => {
            this._bindTextarea();
        });

        // MOD state change: clear output if disabled
        window.addEventListener('mods:changed', (e) => {
            if (e.detail?.modId === 'markdown-preview' && !e.detail.enabled && _outputEl) {
                _outputEl.innerHTML = '';
            }
        });
    },

    async activate(ctx) {
        if (!ModState.isEnabled('markdown-preview')) {
            if (_outputEl) _outputEl.innerHTML = `<div class="md-empty">${t('mods.markdownPreview.disabled')}</div>`;
            return;
        }
        this._bindTextarea();
        const textarea = this._getActiveTextarea();
        if (textarea) this._renderMarkdown(textarea.value);
    },

    async deactivate() {},

    async checkHealth() {
        return 'online';
    },

    destroy() {
        if (_activeTextarea) {
            _activeTextarea.removeEventListener('input', this._onTextareaInput);
        }
    },

    // --- Private ---

    _getActiveTextarea() {
        const activePage = document.querySelector('.page.active');
        if (!activePage) return null;
        const page = activePage.dataset.page;
        const pageDef = this.pages[page];
        if (!pageDef) return null;
        return document.querySelector(pageDef.textareaSelector);
    },

    _bindTextarea() {
        const textarea = this._getActiveTextarea();
        if (_activeTextarea === textarea) return;

        if (_activeTextarea) {
            _activeTextarea.removeEventListener('input', this._onTextareaInput);
        }

        _activeTextarea = textarea;

        if (_activeTextarea) {
            _activeTextarea.addEventListener('input', this._onTextareaInput);
            if (ModState.isEnabled('markdown-preview')) {
                this._renderMarkdown(_activeTextarea.value);
            }
        }
    },

    _onTextareaInput: function() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => {
            if (!ModState.isEnabled('markdown-preview')) return;
            const textarea = _activeTextarea;
            if (textarea && _outputEl) {
                _renderMarkdownImpl(textarea.value);
            }
        }, 300);
    },

    _renderMarkdown(text) {
        _renderMarkdownImpl(text);
    }
};

function _renderMarkdownImpl(text) {
    if (!_outputEl) return;
    if (!text || !text.trim()) {
        _outputEl.innerHTML = `<div class="md-empty">${t('mods.markdownPreview.emptyContent')}</div>`;
        return;
    }
    try {
        if (typeof marked !== 'undefined') {
            _outputEl.innerHTML = marked.parse(text, { breaks: true, gfm: true });
        } else {
            _outputEl.textContent = text;
        }
    } catch (e) {
        console.error('Markdown render failed:', e);
        _outputEl.textContent = text;
    }
}
