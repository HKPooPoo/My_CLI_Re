/**
 * Markdown Preview MOD — Code module (data in manifest.json)
 */

// BYPASS: Direct import — t() needed in debounced input handler where no ctx is available
import { t } from '../../javascript/i18n.js';

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
            this._outputEl = output;
        }

        // Pre-bind input handler — arrow function captures `this` (template object)
        this._boundOnInput = () => {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => {
                if (this._activeTextarea && this._outputEl) {
                    _renderMarkdownImpl(this._outputEl, this._activeTextarea.value);
                }
            }, 300);
        };

        ctx.events.on('navi:pageChanged', () => {
            this._bindTextarea();
        });

        ctx.events.on('mods:instanceRemoved', (e) => {
            if (e.detail?.templateId === 'markdown-preview' && this._outputEl) {
                this._outputEl.innerHTML = '';
            }
        });
    },

    async activate(ctx) {
        this._currentInstanceId = ctx.instanceId || null;
        this._bindTextarea();
        if (this._activeTextarea) this._renderMarkdown(this._activeTextarea.value);
    },

    async deactivate() {},

    async checkHealth() {
        return 'online';
    },

    destroy() {
        if (this._activeTextarea && this._boundOnInput) {
            this._activeTextarea.removeEventListener('input', this._boundOnInput);
        }
    },

    // --- Private ---

    // BYPASS: Direct DOM query — needed in navi:pageChanged handler where no ctx is available
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
        if (this._activeTextarea === textarea) return;

        if (this._activeTextarea && this._boundOnInput) {
            this._activeTextarea.removeEventListener('input', this._boundOnInput);
        }

        this._activeTextarea = textarea;

        if (this._activeTextarea && this._boundOnInput) {
            this._activeTextarea.addEventListener('input', this._boundOnInput);
            this._renderMarkdown(this._activeTextarea.value);
        }
    },

    _renderMarkdown(text) {
        _renderMarkdownImpl(this._outputEl, text);
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

function _renderMarkdownImpl(outputEl, text) {
    if (!outputEl) return;
    if (!text || !text.trim()) {
        outputEl.innerHTML = `<div class="md-empty">${t('mods.markdownPreview.emptyContent')}</div>`;
        return;
    }
    try {
        if (typeof marked !== 'undefined') {
            outputEl.innerHTML = _sanitizeHtml(marked.parse(text, { breaks: true, gfm: true }));
        } else {
            outputEl.textContent = text;
        }
    } catch (e) {
        console.error('Markdown render failed:', e);
        outputEl.textContent = text;
    }
}
