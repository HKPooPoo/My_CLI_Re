/**
 * Feature: Markdown Preview
 * Renders the current page's textarea as Markdown inside the shelf.
 * Debounced 300ms on input. Sanitises output to block scripts / inline JS.
 */

const ICON_URL = '/images/markdown_preview.svg';

const PAGE_TEXTAREA_MAP = {
    'blackboard-log':    '#log-textarea',
    'broadcast-channel': '#channel-textarea',
};

let _$output = null;
let _activeTextarea = null;
let _debounceTimer = null;

function sanitizeHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('script, iframe, object, embed, form, style, link, meta, base')
        .forEach(el => el.remove());
    for (const el of div.querySelectorAll('*')) {
        for (const attr of [...el.attributes]) {
            const name = attr.name;
            const val = attr.value.replace(/\s/g, '').toLowerCase();
            if (name.startsWith('on') ||
                ((name === 'href' || name === 'src' || name === 'action') && val.startsWith('javascript:'))) {
                el.removeAttribute(name);
            }
        }
    }
    return div.innerHTML;
}

function render(text) {
    if (!_$output) return;
    if (!text || !text.trim()) {
        _$output.innerHTML = '<div class="md-empty">NO CONTENT</div>';
        return;
    }
    try {
        if (typeof marked !== 'undefined') {
            _$output.innerHTML = sanitizeHtml(marked.parse(text, { breaks: true, gfm: true }));
        } else {
            _$output.textContent = text;
        }
    } catch (e) {
        console.error('Markdown render failed:', e);
        _$output.textContent = text;
    }
}

function getActiveTextarea() {
    const page = document.querySelector('.page.active')?.dataset.page;
    const selector = PAGE_TEXTAREA_MAP[page];
    return selector ? document.querySelector(selector) : null;
}

function onTextareaInput() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
        const ta = getActiveTextarea();
        if (ta) render(ta.value);
    }, 300);
}

function bindTextarea() {
    const ta = getActiveTextarea();
    if (_activeTextarea === ta) return;
    if (_activeTextarea) _activeTextarea.removeEventListener('input', onTextareaInput);
    _activeTextarea = ta;
    if (_activeTextarea) {
        _activeTextarea.addEventListener('input', onTextareaInput);
    }
}

export const feature = {
    id: 'markdown-preview',
    iconUrl: ICON_URL,
    pages: Object.keys(PAGE_TEXTAREA_MAP),
    hasShelf: true,
    initShelf($shelf) {
        $shelf.innerHTML = `
            <div class="feature-panel" data-feature="markdown-preview">
                <div class="feature-title">MARKDOWN PREVIEW</div>
                <div class="mod-shelf-content" id="feature-markdown-output"></div>
            </div>
        `;
        _$output = $shelf.querySelector('#feature-markdown-output');
    },
    onOpen(_$shelf) {
        bindTextarea();
        const ta = getActiveTextarea();
        if (ta) render(ta.value);
    },
};

// Rebind on page change so the preview follows the active textarea
window.addEventListener('navi:pageChanged', () => bindTextarea());
