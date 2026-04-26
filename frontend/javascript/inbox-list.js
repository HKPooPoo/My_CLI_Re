/**
 * Inbox List - Inbox List Controller
 * =================================================================
 * Mirrors broadcast-list.js but for the many-to-one inbox subsystem.
 * Inboxes are server-bound from creation — there is no local-only
 * draft state — so this list is always a direct view of the server's
 * /api/inboxes response, cached into IDB for fast re-render.
 *
 * CREATE button: POSTs immediately (no local draft). Title required.
 * DELETE button: DELETEs server inbox + cascades local rows. Owner only.
 *
 * Selection click → inbox:selected event → IXThread.loadInbox.
 * =================================================================
 */

import { InboxService } from './services/inbox-service.js';
import { IXMeta } from './inbox-db.js';
import { InfiniteList } from './blackboard-ui-list.js';
import { MultiStepButton } from './multiStepButton.js';
import { BBMessage } from './blackboard-msg.js';
import { playAudio } from './audio.js';
import { t } from './i18n.js';
import { T } from './timing.js';
import { updateNaviPosition } from './navi.js';
import { makeStatusLegend } from './list-status.js';
import { getHKTTimestamp } from './utils.js';

const $ixNaviText = document.querySelector(
    '.sub-navi-item[data-sub-navi-item="inbox-thread"] .sub-navi-item-text'
);

export const IXList = {
    elements: {
        container: document.querySelector('.inbox-list-list-container'),
        createBtn: document.getElementById('inbox-create-btn'),
        deleteBtn: document.getElementById('inbox-delete-btn'),
        searchInput: document.getElementById('inbox-search'),
    },

    inboxes: [],
    infiniteList: null,
    selectionTimer: null,
    selectedInbox: null,
    _fetchController: null,

    init() {
        this.bindEvents();
        this.updateActionButtonsVisibility();
    },

    // ── Permission helpers ───────────────────────────────────────

    hasTitle() {
        return !!localStorage.getItem('currentTitle');
    },

    isOwnerOf(inbox) {
        const me = localStorage.getItem('currentUser');
        return me && inbox && inbox.owner_uid === me;
    },

    /**
     * CREATE shows for any titled user.
     * DELETE only when an owned inbox is selected.
     */
    updateActionButtonsVisibility() {
        const titled = this.hasTitle();
        const isOwnerOfSelected = this.selectedInbox && this.isOwnerOf(this.selectedInbox);

        if (this.elements.createBtn) {
            this.elements.createBtn.style.display = titled ? '' : 'none';
        }
        if (this.elements.deleteBtn) {
            this.elements.deleteBtn.style.display = (titled && isOwnerOfSelected) ? '' : 'none';
        }
    },

    // ── Events ───────────────────────────────────────────────────

    bindEvents() {
        window.addEventListener('auth:updated', () => {
            this.updateActionButtonsVisibility();
            this.selectedInbox = null;
            this.fetchAndRender();
        });

        window.addEventListener('focus', () => {
            const activePage = document.querySelector('.page.active');
            const isIXActive = activePage && activePage.dataset.page?.startsWith('inbox-');
            if (isIXActive) this.fetchAndRender();
        });

        // Re-fetch when the page becomes active so [NEW] indicators
        // and counts stay live without a page-load refresh.
        window.addEventListener('navi:pageChanged', (e) => {
            if (e.detail?.page === 'inbox-list') this.fetchAndRender();
        });

        // WS-driven re-fetch — the InboxUpdated event payload is
        // metadata-only, so re-pull through HTTP rather than try to
        // patch in-place.
        window.addEventListener('inbox:signalUpdated', () => {
            this.fetchAndRender();
        });

        // List cursor → 500ms debounce → dispatch inbox:selected
        window.addEventListener('list:selectionChanged', (e) => {
            const { item } = e.detail;
            if (!item || !this.elements.container?.contains(item)) return;

            const inboxId = parseInt(item.dataset.inboxId);
            const inbox = this.inboxes.find(i => i.id === inboxId);
            if (!inbox) return;

            this.selectedInbox = inbox;
            this.updateActionButtonsVisibility();

            clearTimeout(this.selectionTimer);
            this.selectionTimer = setTimeout(() => {
                this.updateNaviText(inbox.name);
                window.dispatchEvent(new CustomEvent('inbox:selected', { detail: inbox }));
            }, T('frontend.ui.listSelectionDebounce'));
        });

        // CREATE — server-bound, no local draft. Title required.
        if (this.elements.createBtn) {
            new MultiStepButton(this.elements.createBtn, {
                sound: 'UIPipboyOKPress.mp3',
                steps: 1,
                action: async () => {
                    if (!this.hasTitle()) {
                        return BBMessage.error(t('inbox.titleRequired'));
                    }
                    const autoName = `IX_${Date.now()}`;
                    const msg = BBMessage.loading(t('inbox.creating'));
                    try {
                        const result = await InboxService.create({ name: autoName });
                        msg.update(t('inbox.createComplete'));
                        await this.fetchAndRender();
                        // Auto-select the new inbox
                        const newId = result?.inbox?.id;
                        if (newId) {
                            const created = this.inboxes.find(i => i.id === newId);
                            if (created) {
                                this.selectedInbox = created;
                                this.render();
                                this.updateActionButtonsVisibility();
                                this.updateNaviText(created.name);
                                window.dispatchEvent(new CustomEvent('inbox:selected', { detail: created }));
                            }
                        }
                    } catch (e) {
                        msg.close();
                        const status = e.status || e.response?.status;
                        if (status === 403)      BBMessage.error(t('inbox.titleRequired'));
                        else if (status === 409) BBMessage.error(t('inbox.renameTaken'));
                        else                     BBMessage.error(t('inbox.createFailed'));
                    }
                },
            });
        }

        // DELETE — owner only. 3-step destructive.
        if (this.elements.deleteBtn) {
            new MultiStepButton(this.elements.deleteBtn, {
                sound: 'UIGeneralCancel.mp3',
                steps: 3,
                action: async () => {
                    if (!this.hasTitle()) return BBMessage.error(t('inbox.titleRequired'));
                    if (!this.selectedInbox) return BBMessage.error(t('inbox.noTarget'));
                    if (!this.isOwnerOf(this.selectedInbox)) return BBMessage.error(t('inbox.notOwner'));

                    const target = this.selectedInbox;
                    const msg = BBMessage.loading(t('inbox.deleting'));
                    try {
                        await InboxService.destroy(target.id);
                        await IXMeta.deleteInbox(target.id);
                        this.selectedInbox = null;
                        this.updateActionButtonsVisibility();
                        this.updateNaviText('');
                        msg.update(t('inbox.deleteComplete'));
                        window.dispatchEvent(new CustomEvent('inbox:cleared'));
                        await this.fetchAndRender();
                    } catch (e) {
                        msg.close();
                        const status = e.status || e.response?.status;
                        if (status === 403)      BBMessage.error(t('inbox.notOwner'));
                        else if (status === 404) BBMessage.error(t('inbox.errInboxNotFound'));
                        else                     BBMessage.error(t('inbox.deleteFailed'));
                    }
                },
            });
        }
    },

    // ── Data ─────────────────────────────────────────────────────

    async fetchAndRender() {
        // Don't trample a rename input mid-edit.
        const isTyping = document.activeElement && document.activeElement.classList.contains('inbox-list-tag');
        if (isTyping) return;

        this._fetchController?.abort();
        this._fetchController = new AbortController();
        const { signal } = this._fetchController;

        try {
            const data = await InboxService.listInboxes(signal);
            if (signal.aborted) return;
            const inboxes = data?.inboxes ?? [];

            // Cache into IDB so dashboard / cross-tab reads see the same data
            for (const ib of inboxes) {
                await IXMeta.upsertInbox({
                    server_inbox_id: ib.id,
                    name: ib.name,
                    description: ib.description,
                    owner_uid: ib.owner_uid,
                    owner_title: ib.owner_title,
                    whitelist_id: ib.whitelist_id,
                    last_signal: ib.last_signal,
                    submission_count: ib.submission_count,
                    has_my_submission: ib.has_my_submission,
                    my_feedback_at: ib.my_feedback_at,
                });
            }

            this.inboxes = inboxes;
            // Drop stale selection when the server view no longer includes it
            if (this.selectedInbox && !this.inboxes.some(i => i.id === this.selectedInbox.id)) {
                this.selectedInbox = null;
            }
            this.render();
            this.updateActionButtonsVisibility();
        } catch (e) {
            if (signal.aborted || e.name === 'AbortError') return;
            console.error('IXList: fetch failed', e);
            BBMessage.error(t('inbox.syncFailed'));
        }
    },

    // ── Rendering ────────────────────────────────────────────────

    /**
     * [NEW] indicator: receiver vs sender perspectives differ.
     *  - Receiver (I am inbox owner): NEW means "submission_count
     *    grew since I last viewed". Approximation here uses the
     *    inbox's last_signal — refinement (per-row submission seen
     *    timestamps) deferred to a follow-up.
     *  - Sender (I have a submission): NEW means feedback_at is
     *    newer than my_feedback_at_seen — i.e. owner just wrote
     *    back and I haven't opened the thread yet.
     */
    async hasUnread(inbox) {
        if (this.isOwnerOf(inbox)) return false; // Owner-side flag deferred
        if (!inbox.has_my_submission || inbox.my_feedback_at === null) return false;
        const cached = await IXMeta.getInbox(inbox.id);
        const seen = cached?.my_feedback_at_seen ?? 0;
        return inbox.my_feedback_at > seen;
    },

    async render() {
        if (!this.elements.container) return;

        const selectedId = this.selectedInbox?.id ?? null;
        this.elements.container.innerHTML = '';

        // hasUnread is async — resolve all in parallel before painting
        const flags = await Promise.all(this.inboxes.map(i => this.hasUnread(i)));

        this.inboxes.forEach((inbox, idx) => {
            const item = document.createElement('div');
            item.classList.add('inbox-list-list-item');
            if (selectedId !== null && inbox.id === selectedId) item.classList.add('active');
            item.dataset.inboxId = inbox.id;

            // Row 1: name input (rename owner-only)
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.classList.add('inbox-list-tag');
            nameInput.value = inbox.name;
            nameInput.placeholder = t('inbox.namePlaceholder');
            if (!this.isOwnerOf(inbox)) nameInput.disabled = true;
            nameInput.addEventListener('change', async (e) => {
                const newName = e.target.value.trim();
                if (!newName) {
                    e.target.value = inbox.name;
                    return BBMessage.error(t('inbox.nameEmpty'));
                }
                if (newName === inbox.name) return;  // no-op
                if (!this.isOwnerOf(inbox)) {
                    e.target.value = inbox.name;
                    return BBMessage.error(t('inbox.notOwner'));
                }
                try {
                    await InboxService.update(inbox.id, { name: newName });
                    inbox.name = newName;
                    this.updateNaviText(newName);
                    BBMessage.success(t('inbox.renameComplete'));
                } catch (err) {
                    e.target.value = inbox.name;
                    // Map status to localized message — never surface
                    // backend's raw English (e.g. 'NAME ALREADY TAKEN').
                    const status = err.status || err.response?.status;
                    if (status === 409)      BBMessage.error(t('inbox.renameTaken'));
                    else if (status === 403) BBMessage.error(t('inbox.notOwner'));
                    else if (status === 404) BBMessage.error(t('inbox.errInboxNotFound'));
                    else                     BBMessage.error(t('inbox.renameFailed'));
                }
            });
            nameInput.addEventListener('click', e => e.stopPropagation());
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
                e.stopPropagation();
            });

            // Row 2: last signal timestamp + submission count
            const meta = document.createElement('div');
            meta.classList.add('inbox-list-meta');
            const ts = inbox.last_signal ? getHKTTimestamp(inbox.last_signal) : t('common.head');
            meta.textContent = `${ts} · ${t('inbox.subCount', { count: inbox.submission_count ?? 0 })}`;

            // Row 3: owner title (no text tags — GUI convention matches
            // BB/BC where status is conveyed purely through the icon
            // legend, not inline text like [OWNED] or [SUBMITTED]).
            const role = document.createElement('div');
            role.classList.add('inbox-list-role');
            role.textContent = inbox.owner_title || inbox.owner_uid || '';

            // Status icons — same vocabulary as BC/WT. Only `new`
            // (envelope) is active; other states (owned, submitted)
            // are contextually obvious without a dedicated icon.
            const iconsWrap = makeStatusLegend({
                new: flags[idx],
            });

            item.appendChild(nameInput);
            item.appendChild(meta);
            item.appendChild(role);
            item.appendChild(iconsWrap);
            this.elements.container.appendChild(item);
        });

        if (this.infiniteList) {
            this.infiniteList.refresh();
        } else if (this.inboxes.length > 0) {
            this.infiniteList = new InfiniteList(this.elements.container, '.inbox-list-list-item');
        }
    },

    updateNaviText(name) {
        if ($ixNaviText) {
            $ixNaviText.textContent = name ? name : '<-->';
            const $activeNaviItem = document.querySelector('.navi-item.active');
            if ($activeNaviItem && $activeNaviItem.dataset.naviItem === 'inbox') {
                updateNaviPosition('inbox', true);
            }
        }
    },
};

// ── Search ───────────────────────────────────────────────────────

function applyIxSearch() {
    const $listEl = document.querySelector('.inbox-list-list-container');
    if (!$listEl) return;
    const query = (IXList.elements.searchInput?.value || '').toLowerCase().trim();
    $listEl.querySelectorAll('.inbox-list-list-item').forEach(item => {
        if (!query) { item.style.display = ''; return; }
        let text = item.innerText.toLowerCase();
        item.querySelectorAll('input').forEach(el => {
            if (el.value) text += ' ' + el.value.toLowerCase();
        });
        item.style.display = text.includes(query) ? '' : 'none';
    });
    IXList.infiniteList?.refresh();
}
IXList.elements.searchInput?.addEventListener('input', applyIxSearch);

const $ixListEl = document.querySelector('.inbox-list-list-container');
if ($ixListEl) {
    new MutationObserver(() => applyIxSearch()).observe($ixListEl, { childList: true });
}

// Init
IXList.init();
IXList.fetchAndRender();
