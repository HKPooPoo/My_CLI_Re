/**
 * Markdown Preview MOD Template - Renders Markdown in feature shelf
 * =================================================================
 * Single-instance template. Uses the global `marked` library.
 * Page-aware: binds to the active textarea and renders on input.
 *
 * v2.0.0: Uses ModContext API (ctx.events.on for auto-cleanup,
 * ctx.instance.isEnabled, ctx.i18n.t)
 * =================================================================
 */

import { t } from '../../javascript/i18n.js';

let _debounceTimer = null;
let _activeTextarea = null;
let _outputEl = null;
let _currentInstanceId = null;

export default {
    // --- Identity ---
    id: 'markdown-preview',
    group: 'utilities',
    nameKey: 'mods.markdownPreview.name',
    descriptionKey: 'mods.markdownPreview.desc',

    // --- Metadata (v2) ---
    version: '2.0.0',

    // --- Instance architecture ---
    maxInstances: 1,

    getButtonDataId(config) {
        return 'markdown-preview';
    },

    getInstanceName(config, tFn) {
        return tFn('mods.markdownPreview.name');
    },

    defaultInstances: [{ config: {} }],

    // --- Feature integration ---
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

    // --- Lifecycle ---
    async init(ctx) {
        const shelf = ctx.ui.getShelfElement();
        if (shelf) {
            const output = document.createElement('div');
            output.id = 'feature-markdown-output';
            output.className = 'markdown-rendered';
            shelf.appendChild(output);
            _outputEl = output;
        }

        // Use ctx.events.on for managed subscriptions
        ctx.events.on('navi:pageChanged', () => {
            this._bindTextarea();
        });

        ctx.events.on('mods:instanceRemoved', (e) => {
            if (e.detail?.templateId === 'markdown-preview' && _outputEl) {
                _outputEl.innerHTML = '';
            }
        });
    },

    async activate(ctx) {
        _currentInstanceId = ctx.instanceId || null;
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
            this._renderMarkdown(_activeTextarea.value);
        }
    },

    _onTextareaInput: function() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => {
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
