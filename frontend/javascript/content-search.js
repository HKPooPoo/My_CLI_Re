/**
 * Content Search (Tier 24)
 * =================================================================
 * Shared search pill. Collapsed = 36 px circular magnifying-glass
 * icon. Expanded = [icon] [input] [prev ◀] [next ▶] [count].
 *
 * Two placements so the pill can sit where each board has visual
 * room:
 *
 *   placement: 'rail' (BB / BC)
 *     Appended into the preview rail column. Uses `margin-top: auto`
 *     so it docks at the BOTTOM of the rail, just under the last
 *     preview block. Rail → textarea parity: the rail is already
 *     always the full textarea height, so "rail bottom" reads as
 *     "textarea bottom-left".
 *
 *   placement: 'overlay' (WT WE + WT THEY)
 *     Absolute-positioned inside `root`, anchored bottom-left. WT
 *     has no rail and the textarea fills the panel edge-to-edge, so
 *     this overlay sits visually inside the textarea's bottom-left.
 *
 * Match target: the records backing the currently-open branch /
 * channel / connection. A match moves HEAD to that record via the
 * board-supplied `navigateTo(head)` adapter. No cross-branch search
 * — users switch containers via the list page, search stays local
 * to the open one.
 *
 * Consumer contract — attachContentSearch({
 *   root,          // container the UI is appended to (rail or panel)
 *   placement,     // 'rail' | 'overlay' (default 'overlay')
 *   getRecords,    // async () => [{ text, head }, ...] newest-first
 *   getCurrentHead,// () => number (or null when virtual/no selection)
 *   navigateTo,    // async (head) => { move HEAD + redraw editor }
 * })
 * =================================================================
 */

// i18n is applied declaratively via `data-i18n-placeholder` +
// `data-hint` on the DOM we inject — initI18n's renderDOM scan picks
// them up after fetch resolves. No direct `t()` calls needed here.

// Collapse-reopen-persist is scoped per root — a user searching on BB
// shouldn't find WT's pill already open when they switch sections.
const _instances = new WeakMap();

export function attachContentSearch(config) {
    const { root } = config;
    if (!root) return null;
    if (_instances.has(root)) return _instances.get(root);

    const api = new ContentSearchInstance(config);
    _instances.set(root, api);
    return api;
}

class ContentSearchInstance {
    constructor(config) {
        this.config = config;
        this.matches = [];     // array of record heads that match current query
        this.matchIdx = -1;    // index INTO this.matches of the currently-highlighted match
        this.expanded = false;
        this._buildDom();
        this._bindEvents();
    }

    _buildDom() {
        const placement = this.config.placement === 'rail' ? 'rail' : 'overlay';
        const wrap = document.createElement('div');
        wrap.className = `editor-search editor-search--${placement}`;

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'editor-search-toggle';
        toggleBtn.setAttribute('aria-label', 'Search page content');
        toggleBtn.dataset.hint = 'hints.search.open';

        const pill = document.createElement('div');
        pill.className = 'editor-search-pill';
        pill.setAttribute('role', 'search');

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'editor-search-input';
        input.dataset.i18nPlaceholder = 'search.placeholder';

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'editor-search-nav editor-search-prev';
        prevBtn.setAttribute('aria-label', 'Previous match');
        prevBtn.dataset.hint = 'hints.search.prev';
        prevBtn.textContent = '◀';

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'editor-search-nav editor-search-next';
        nextBtn.setAttribute('aria-label', 'Next match');
        nextBtn.dataset.hint = 'hints.search.next';
        nextBtn.textContent = '▶';

        const count = document.createElement('span');
        count.className = 'editor-search-count';
        count.textContent = '';

        pill.appendChild(input);
        pill.appendChild(prevBtn);
        pill.appendChild(nextBtn);
        pill.appendChild(count);

        wrap.appendChild(toggleBtn);
        wrap.appendChild(pill);

        this.config.root.appendChild(wrap);

        this.els = { wrap, toggleBtn, pill, input, prevBtn, nextBtn, count };
    }

    _bindEvents() {
        const { toggleBtn, input, prevBtn, nextBtn } = this.els;

        toggleBtn.addEventListener('click', () => this.toggle());

        input.addEventListener('input', () => this._refreshMatches(input.value));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) this.prev();
                else this.next();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.collapse();
            }
        });

        prevBtn.addEventListener('click', () => this.prev());
        nextBtn.addEventListener('click', () => this.next());

        // Click outside the pill collapses it — same feel as a native
        // popover. Ignore clicks on the toggle (that's the explicit
        // open/close action).
        document.addEventListener('pointerdown', (e) => {
            if (!this.expanded) return;
            if (this.els.wrap.contains(e.target)) return;
            this.collapse();
        });
    }

    toggle() {
        if (this.expanded) this.collapse();
        else this.expand();
    }

    expand() {
        this.expanded = true;
        this.els.wrap.classList.add('expanded');
        this.els.input.focus();
        // Re-run a match pass with whatever's already in the input
        // (so reopening with a prior query immediately shows count).
        this._refreshMatches(this.els.input.value);
    }

    collapse() {
        this.expanded = false;
        this.els.wrap.classList.remove('expanded');
    }

    async _refreshMatches(query) {
        const q = (query || '').trim();
        if (!q) {
            this.matches = [];
            this.matchIdx = -1;
            this._renderCount();
            return;
        }

        const records = await this.config.getRecords();
        const ql = q.toLowerCase();
        this.matches = records
            .map((rec, head) => ({ head, text: rec.text || '' }))
            .filter(r => r.text.toLowerCase().includes(ql))
            .map(r => r.head);

        // Anchor to the match closest to the current head so the first
        // Next/Prev feels responsive (no jarring jump to page 0 when
        // the user's already on a matching page further down).
        const curr = this.config.getCurrentHead?.();
        this.matchIdx = -1;
        if (typeof curr === 'number' && this.matches.length > 0) {
            const exact = this.matches.indexOf(curr);
            if (exact >= 0) this.matchIdx = exact;
        }
        this._renderCount();
    }

    _renderCount() {
        const { count } = this.els;
        const total = this.matches.length;
        if (!total) {
            count.textContent = this.els.input.value.trim() ? '0/0' : '';
            return;
        }
        // 1-indexed for display, 0-indexed internal.
        const shown = this.matchIdx >= 0 ? this.matchIdx + 1 : 0;
        count.textContent = `${shown}/${total}`;
    }

    async next() {
        if (!this.matches.length) return;
        this.matchIdx = (this.matchIdx + 1) % this.matches.length;
        await this._jumpTo(this.matches[this.matchIdx]);
        this._renderCount();
    }

    async prev() {
        if (!this.matches.length) return;
        this.matchIdx = (this.matchIdx - 1 + this.matches.length) % this.matches.length;
        await this._jumpTo(this.matches[this.matchIdx]);
        this._renderCount();
    }

    async _jumpTo(head) {
        try {
            await this.config.navigateTo(head);
        } catch (err) {
            console.error('[content-search] navigate failed', err);
        }
    }

    /** External callers that invalidate the record set (branch switch,
     *  channel switch, new record committed) can call refresh() to
     *  re-run the filter against the open pill. */
    async refresh() {
        if (!this.expanded) return;
        await this._refreshMatches(this.els.input.value);
    }
}
