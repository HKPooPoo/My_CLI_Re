/**
 * Markdown Preview MOD Template - Renders Markdown in feature shelf
 * =================================================================
 * Singleton template. Uses the global `marked` library.
 * Page-aware: binds to the active textarea and renders on input.
 * =================================================================
 */

import { ModState } from '../../javascript/mod-state.js';
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

    // --- Instance architecture ---
    singleton: true,

    getButtonDataId(config) {
        return 'markdown-preview';
    },

    getInstanceName(config, tFn) {
        return (tFn || t)('mods.markdownPreview.name');
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
    sharedConfigGroup: null,

    // --- Lifecycle ---
    async init(ctx) {
        const shelf = document.querySelector('[data-feature-shelf="markdown-preview"]');
        if (shelf) {
            const output = document.createElement('div');
            output.id = 'feature-markdown-output';
            output.className = 'markdown-rendered';
            shelf.appendChild(output);
            _outputEl = output;
        }

        window.addEventListener('navi:pageChanged', () => {
            this._bindTextarea();
        });

        window.addEventListener('mods:changed', (e) => {
            // Check if any markdown-preview instance was disabled
            if (e.detail?.templateId === 'markdown-preview' && !e.detail.enabled && _outputEl) {
                _outputEl.innerHTML = '';
            }
        });
    },

    async activate(ctx) {
        _currentInstanceId = ctx?.instanceId || null;

        // Check if instance is enabled
        if (_currentInstanceId && !ModState.isEnabled(_currentInstanceId)) {
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
            // Check if any markdown-preview instance is enabled
            const mdInstances = ModState.getInstancesByTemplate('markdown-preview');
            const anyEnabled = mdInstances.some(i => ModState.isEnabled(i.instanceId));
            if (anyEnabled) {
                this._renderMarkdown(_activeTextarea.value);
            }
        }
    },

    _onTextareaInput: function() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => {
            const mdInstances = ModState.getInstancesByTemplate('markdown-preview');
            const anyEnabled = mdInstances.some(i => ModState.isEnabled(i.instanceId));
            if (!anyEnabled) return;
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
