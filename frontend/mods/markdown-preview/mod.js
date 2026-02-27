/**
 * Markdown Preview MOD — Code module (data in manifest.json)
 */

import { t } from '../../javascript/i18n.js';

let _debounceTimer = null;
let _activeTextarea = null;
let _outputEl = null;
let _currentInstanceId = null;

export default {
    getButtonDataId(config) {
        return 'markdown-preview';
    },

    getInstanceName(config, tFn) {
        return tFn('mods.markdownPreview.name');
    },

    async init(ctx) {
        const shelf = ctx.ui.getShelfElement();
        if (shelf) {
            const output = document.createElement('div');
            output.id = 'feature-markdown-output';
            output.className = 'markdown-rendered mod-shelf-content';
            shelf.appendChild(output);
            _outputEl = output;
        }

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

/**
 * Sanitize HTML output from marked to prevent XSS.
 * Strips <script>, <iframe>, <object>, <embed>, <form>, event attributes,
 * and javascript: URLs.
 */
function _sanitizeHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;

    // Remove dangerous elements
    div.querySelectorAll('script, iframe, object, embed, form, style, link, meta, base')
        .forEach(el => el.remove());

    // Remove event attributes and javascript: hrefs from all elements
    for (const el of div.querySelectorAll('*')) {
        for (const attr of [...el.attributes]) {
            if (attr.name.startsWith('on') || (attr.name === 'href' || attr.name === 'src' || attr.name === 'action') &&
                attr.value.replace(/\s/g, '').toLowerCase().startsWith('javascript:')) {
                el.removeAttribute(attr.name);
            }
        }
    }

    return div.innerHTML;
}

function _renderMarkdownImpl(text) {
    if (!_outputEl) return;
    if (!text || !text.trim()) {
        _outputEl.innerHTML = `<div class="md-empty">${t('mods.markdownPreview.emptyContent')}</div>`;
        return;
    }
    try {
        if (typeof marked !== 'undefined') {
            _outputEl.innerHTML = _sanitizeHtml(marked.parse(text, { breaks: true, gfm: true }));
        } else {
            _outputEl.textContent = text;
        }
    } catch (e) {
        console.error('Markdown render failed:', e);
        _outputEl.textContent = text;
    }
}
