/**
 * Inbox Thread - 3-Window Submission Page
 * =================================================================
 * Polymorphic page: same DOM, two modes driven by `inbox.owner_uid`:
 *
 *   Sender mode (default — non-owner):
 *     - Single submission, single page (no push/pull/preview)
 *     - sender_text: editable, auto-saves to IDB on 200ms debounce
 *     - file_hash:   editable, auto-saves to IDB on attach
 *     - receiver_text: read-only (the inbox owner's feedback)
 *     - POST button: push my IDB row → server (manual sync)
 *     - PULL button: re-fetch the server's view of my row
 *
 *   Receiver mode (owner of inbox):
 *     - Push/pull across all submissions; preview rail per row
 *     - sender_text + file: read-only (somebody else wrote it)
 *     - receiver_text: editable, auto-saves to IDB on input
 *     - POST button: push the active row's receiver_text → server
 *     - PULL button: re-fetch all submissions
 *
 * The local-first contract matches BB/BC: textareas debounce-write
 * to IDB, but the server only changes when the user clicks a button.
 * =================================================================
 */

import { InboxService } from './services/inbox-service.js';
import { FileService } from './services/file-service.js';
import { IXMeta, IXSubmissions } from './inbox-db.js';
import { BBMessage } from './blackboard-msg.js';
import { MultiStepButton } from './multiStepButton.js';
import { TimerGroup } from './timer-group.js';
import { t } from './i18n.js';
import { T } from './timing.js';
import { getEcho } from './echo-service.js';
import db from './indexedDB.js';

const SAVE_DEBOUNCE_KEY = 'inboxAutoSave';

export const IXThread = {
    elements: {
        page: document.querySelector('.page[data-page="inbox-thread"]'),
        container: document.getElementById('inbox-thread-container'),
        empty: document.getElementById('inbox-thread-empty'),
        body: document.getElementById('inbox-thread-body'),
        previewRail: document.getElementById('inbox-preview-rail'),
        senderArea: document.getElementById('inbox-sender-textarea'),
        receiverArea: document.getElementById('inbox-receiver-textarea'),
        fileSlot: document.getElementById('inbox-file-slot'),
        filePickBtn: document.getElementById('inbox-file-pick-btn'),
        fileInput: document.getElementById('inbox-file-input'),
        fileChip: document.getElementById('inbox-file-chip'),
        postBtn: document.getElementById('inbox-post-btn'),
        pullBtn: document.getElementById('inbox-pull-btn'),
    },

    /** Currently loaded inbox metadata (server snapshot) */
    inbox: null,
    /** 'sender' | 'receiver' — derived from owner_uid */
    mode: 'sender',
    /** Receiver-mode head index into `submissions` (0 = newest) */
    head: 0,
    /** All submissions (receiver mode); single-row array (sender mode) */
    submissions: [],
    /** Save-debounce timers, keyed so we can cancel on inbox switch */
    timers: new TimerGroup(),
    _abortController: null,

    init() {
        this.bindEvents();
        // Hide receiver-only chrome by default
        if (this.elements.previewRail) this.elements.previewRail.style.display = 'none';
    },

    // ── Events ───────────────────────────────────────────────────

    bindEvents() {
        window.addEventListener('inbox:selected', (e) => {
            const inbox = e.detail;
            if (!inbox) return;
            this.loadInbox(inbox);
        });

        window.addEventListener('inbox:cleared', () => {
            this.unloadInbox();
        });

        window.addEventListener('auth:updated', () => {
            this.unloadInbox();
        });

        // Re-fetch when re-entering the thread page so the user
        // sees the latest feedback / submissions on tab return.
        window.addEventListener('navi:pageChanged', (e) => {
            if (e.detail?.page === 'inbox-thread' && this.inbox) {
                this.refreshFromServer({ silent: true });
            }
        });

        // WS-driven re-fetch
        window.addEventListener('inbox:signalUpdated', (e) => {
            if (this.inbox && e.detail?.inboxId === this.inbox.id) {
                this.refreshFromServer({ silent: true });
            }
        });

        // ── Sender textarea ──
        if (this.elements.senderArea) {
            this.elements.senderArea.addEventListener('input', () => {
                if (this.mode !== 'sender' || !this.inbox) return;
                this.scheduleSaveSender();
            });
        }

        // ── Receiver textarea ──
        if (this.elements.receiverArea) {
            this.elements.receiverArea.addEventListener('input', () => {
                if (this.mode !== 'receiver' || !this.inbox) return;
                this.scheduleSaveReceiver();
            });
        }

        // ── File slot (sender only) ──
        if (this.elements.filePickBtn) {
            this.elements.filePickBtn.addEventListener('click', () => {
                if (this.mode !== 'sender') return;
                this.elements.fileInput?.click();
            });
        }
        if (this.elements.fileInput) {
            this.elements.fileInput.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (file) await this.attachFile(file);
                e.target.value = ''; // reset for re-pick of same file
            });
        }

        // ── POST button ──
        if (this.elements.postBtn) {
            new MultiStepButton(this.elements.postBtn, {
                sound: 'UIPipboyOK.mp3',
                steps: 1,
                action: async () => {
                    if (!this.inbox) return BBMessage.error(t('inbox.noInboxSelected'));
                    if (this.mode === 'sender') return this.postAsSender();
                    return this.postAsReceiver();
                },
            });
        }

        // ── PULL button ──
        if (this.elements.pullBtn) {
            new MultiStepButton(this.elements.pullBtn, {
                sound: 'UIGeneralFocus.mp3',
                steps: 1,
                action: async () => {
                    if (!this.inbox) return BBMessage.error(t('inbox.noInboxSelected'));
                    await this.refreshFromServer({ silent: false });
                },
            });
        }

        // ── Push / Pull head navigation (receiver only) ──
        // Reuse the global push/pull buttons attached to .page-container.
        document.querySelector('.push-btn')?.addEventListener('click', () => {
            if (this.mode !== 'receiver') return;
            const activePage = document.querySelector('.page.active');
            if (activePage?.dataset.page !== 'inbox-thread') return;
            this.movePush();
        });
        document.querySelector('.pull-btn')?.addEventListener('click', () => {
            if (this.mode !== 'receiver') return;
            const activePage = document.querySelector('.page.active');
            if (activePage?.dataset.page !== 'inbox-thread') return;
            this.movePull();
        });
    },

    // ── Loading / unloading ──────────────────────────────────────

    async loadInbox(inbox) {
        // Persist any pending edits from the old inbox before switching
        await this.flushPending();
        this._unsubscribeWS();

        this.inbox = inbox;
        const me = localStorage.getItem('currentUser');
        this.mode = (me && inbox.owner_uid === me) ? 'receiver' : 'sender';
        this.elements.page?.setAttribute('data-mode', this.mode);

        // UI scaffolding
        if (this.elements.empty) this.elements.empty.style.display = 'none';
        if (this.elements.body) this.elements.body.style.display = '';
        if (this.elements.previewRail) {
            this.elements.previewRail.style.display = this.mode === 'receiver' ? '' : 'none';
        }

        await this.refreshFromServer({ silent: false });
        this._subscribeWS(inbox.id);
    },

    unloadInbox() {
        this._unsubscribeWS();
        this.inbox = null;
        this.submissions = [];
        this.head = 0;
        this.mode = 'sender';
        if (this.elements.empty) this.elements.empty.style.display = '';
        if (this.elements.body) this.elements.body.style.display = 'none';
        if (this.elements.senderArea) this.elements.senderArea.value = '';
        if (this.elements.receiverArea) this.elements.receiverArea.value = '';
        this.renderFileChip(null);
    },

    // ── WebSocket subscription ───────────────────────────────────

    async _subscribeWS(inboxId) {
        try {
            const echo = await getEcho();
            this._echoChannel = echo.channel(`inbox.${inboxId}`)
                .listen('.inbox.updated', (e) => {
                    if (!this.inbox || this.inbox.id !== e.inbox_id) return;
                    if (e.action === 'destroy') {
                        window.dispatchEvent(new CustomEvent('inbox:cleared'));
                        return;
                    }
                    // Re-pull silently — the payload is metadata-only.
                    // Re-emit for the list page so it can refresh badges.
                    this.refreshFromServer({ silent: true });
                    window.dispatchEvent(new CustomEvent('inbox:signalUpdated', {
                        detail: { inboxId: e.inbox_id, lastSignal: e.last_signal },
                    }));
                });
        } catch (err) {
            // Realtime is best-effort; manual PULL still works without WS
            console.warn('IXThread: WS subscribe failed', err);
        }
    },

    _unsubscribeWS() {
        const inboxId = this.inbox?.id;
        if (!inboxId) return;
        this._echoChannel = null;
        getEcho().then(echo => echo.leaveChannel(`inbox.${inboxId}`)).catch(() => {});
    },

    // ── Server fetch ─────────────────────────────────────────────

    async refreshFromServer({ silent }) {
        if (!this.inbox) return;
        this._abortController?.abort();
        this._abortController = new AbortController();
        const { signal } = this._abortController;

        const msg = silent ? null : BBMessage.loading(t('inbox.pulling'));

        try {
            if (this.mode === 'receiver') {
                const data = await InboxService.fetchSubmissions(this.inbox.id, signal);
                if (signal.aborted) return;
                this.submissions = data?.submissions ?? [];
                await IXSubmissions.replaceForInbox(this.inbox.id, this.submissions);
                if (this.head >= this.submissions.length) this.head = Math.max(0, this.submissions.length - 1);
                this.renderReceiverView();
            } else {
                const data = await InboxService.getMySubmission(this.inbox.id, signal);
                if (signal.aborted) return;
                const row = data?.submission ?? null;
                if (row) {
                    const me = localStorage.getItem('currentUser');
                    await IXSubmissions.upsert({
                        server_inbox_id: this.inbox.id,
                        sender_uid: me,
                        sender_text: row.sender_text,
                        file_hash: row.file_hash,
                        receiver_text: row.receiver_text,
                        feedback_at: row.feedback_at,
                        submitted_at: row.submitted_at,
                        updated_at: row.updated_at,
                        _dirtySender: false,
                        _dirtyReceiver: false,
                    });
                    // Mark feedback seen so [NEW] flag in list view clears
                    if (row.feedback_at) {
                        await IXMeta.markFeedbackSeen(this.inbox.id, row.feedback_at);
                    }
                }
                this.submissions = row ? [{
                    sender_uid: localStorage.getItem('currentUser'),
                    sender_text: row.sender_text,
                    file_hash: row.file_hash,
                    receiver_text: row.receiver_text,
                    feedback_at: row.feedback_at,
                    submitted_at: row.submitted_at,
                    updated_at: row.updated_at,
                }] : [];
                this.head = 0;
                this.renderSenderView();
            }
            msg?.update(t('inbox.pullComplete'), 1500);
        } catch (e) {
            if (signal.aborted || e.name === 'AbortError') return;
            console.error('IXThread refresh failed', e);
            msg?.close();
            const isUserError = e.status >= 400 && e.status < 500;
            BBMessage.error(isUserError ? (e.message || t('inbox.pullFailed')) : t('inbox.pullFailed'));
        }
    },

    // ── Rendering ────────────────────────────────────────────────

    renderSenderView() {
        const row = this.submissions[0];
        if (this.elements.senderArea) {
            this.elements.senderArea.value = row?.sender_text ?? '';
            this.elements.senderArea.disabled = false;
        }
        if (this.elements.receiverArea) {
            this.elements.receiverArea.value = row?.receiver_text ?? '';
            this.elements.receiverArea.disabled = true;
        }
        this.renderFileChip(row?.file_hash ?? null);
        this.elements.filePickBtn?.style.setProperty('display', '');
    },

    renderReceiverView() {
        const row = this.submissions[this.head];
        if (this.elements.senderArea) {
            this.elements.senderArea.value = row?.sender_text ?? '';
            this.elements.senderArea.disabled = true;
        }
        if (this.elements.receiverArea) {
            this.elements.receiverArea.value = row?.receiver_text ?? '';
            this.elements.receiverArea.disabled = false;
        }
        this.renderFileChip(row?.file_hash ?? null, /*readOnly*/ true);
        // Receiver doesn't get the attach picker
        this.elements.filePickBtn?.style.setProperty('display', 'none');
        this.renderPreviewRail();
    },

    renderPreviewRail() {
        if (!this.elements.previewRail) return;
        this.elements.previewRail.innerHTML = '';
        this.submissions.forEach((row, idx) => {
            const block = document.createElement('div');
            block.classList.add('page-preview-block');
            if (idx === this.head) block.classList.add('active');
            if (row.feedback_at === null) block.classList.add('unsynced'); // ungraded yet
            block.dataset.head = idx;
            // Block content: short label = sender uid + feedback marker
            const label = document.createElement('span');
            label.className = 'inbox-preview-block-label';
            const graded = row.feedback_at !== null ? '✓' : '·';
            label.textContent = `${graded} ${row.sender_uid}`;
            block.appendChild(label);

            block.addEventListener('click', async () => {
                await this.flushPending();
                this.head = idx;
                this.renderReceiverView();
            });
            this.elements.previewRail.appendChild(block);
        });
    },

    renderFileChip(hash, readOnly = false) {
        const chip = this.elements.fileChip;
        if (!chip) return;
        if (!hash) {
            chip.style.display = 'none';
            chip.innerHTML = '';
            if (this.elements.filePickBtn) this.elements.filePickBtn.style.display = '';
            return;
        }
        chip.style.display = '';
        chip.innerHTML = '';
        const link = document.createElement('a');
        link.className = 'inbox-file-chip-name';
        link.href = `/api/files/${hash}?inline=1`;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = hash.substring(0, 16) + '…';
        chip.appendChild(link);

        if (!readOnly) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'inbox-file-chip-remove';
            remove.textContent = '×';
            remove.addEventListener('click', () => this.detachFile());
            chip.appendChild(remove);
            // Keep PICK button hidden while a file is attached (1 max)
            if (this.elements.filePickBtn) this.elements.filePickBtn.style.display = 'none';
        }
    },

    // ── Sender actions ───────────────────────────────────────────

    scheduleSaveSender() {
        this.timers.schedule(SAVE_DEBOUNCE_KEY, async () => {
            const me = localStorage.getItem('currentUser');
            if (!me || !this.inbox) return;
            const text = this.elements.senderArea?.value ?? '';
            await IXSubmissions.upsert({
                server_inbox_id: this.inbox.id,
                sender_uid: me,
                sender_text: text,
                _dirtySender: true,
            });
            // Keep our in-memory mirror in sync
            if (this.submissions[0]) {
                this.submissions[0].sender_text = text;
            } else {
                this.submissions = [{
                    sender_uid: me,
                    sender_text: text,
                    file_hash: null,
                    receiver_text: null,
                    feedback_at: null,
                }];
            }
        }, T('frontend.input.bbSaveDebounce'));
    },

    async attachFile(file) {
        if (!this.inbox) return;
        const me = localStorage.getItem('currentUser');
        if (!me) return BBMessage.error(t('inbox.loginRequired'));

        if (!FileService.isAllowedExtension(file.name)) {
            return BBMessage.error(t('files.unsupportedType'));
        }

        const msg = BBMessage.loading(t('inbox.staging'));
        try {
            const hash = await FileService.computeHash(file, file.name);
            // Stage in IDB (status: 'local'); upload happens on POST
            const existing = await db.file_blobs.get(hash);
            if (!existing) {
                await db.file_blobs.put({
                    hash,
                    blob: file,
                    name: file.name,
                    size: file.size,
                    mime: file.type || 'application/octet-stream',
                    status: 'local',
                    last_accessed: Date.now(),
                });
            }
            await IXSubmissions.upsert({
                server_inbox_id: this.inbox.id,
                sender_uid: me,
                file_hash: hash,
                _dirtySender: true,
            });
            if (this.submissions[0]) {
                this.submissions[0].file_hash = hash;
            }
            this.renderFileChip(hash);
            msg.update(t('inbox.fileStaged'));
        } catch (e) {
            console.error('Inbox attach failed', e);
            msg.close();
            BBMessage.error(t('inbox.attachFailed'));
        }
    },

    async detachFile() {
        if (!this.inbox) return;
        const me = localStorage.getItem('currentUser');
        if (!me) return;
        await IXSubmissions.upsert({
            server_inbox_id: this.inbox.id,
            sender_uid: me,
            file_hash: null,
            _dirtySender: true,
        });
        if (this.submissions[0]) this.submissions[0].file_hash = null;
        this.renderFileChip(null);
    },

    async postAsSender() {
        const me = localStorage.getItem('currentUser');
        if (!me) return BBMessage.error(t('inbox.loginRequired'));

        // Read from DOM + in-memory state, not from IDB. This sidesteps
        // any race between an in-flight 200ms debounce write and the
        // POST: whatever is on screen now is what we send.
        this.timers.cancel(SAVE_DEBOUNCE_KEY);
        const senderText = this.elements.senderArea?.value ?? '';
        const fileHash = this.submissions[0]?.file_hash ?? null;

        const msg = BBMessage.loading(t('inbox.posting'));
        try {
            // Upload file blob if local-only
            if (fileHash) {
                const blob = await db.file_blobs.get(fileHash);
                if (blob && blob.status !== 'synced' && blob.blob) {
                    await FileService.upload(blob.blob, blob.name);
                    await db.file_blobs.update(fileHash, { status: 'synced' });
                }
            }
            await InboxService.submit(this.inbox.id, {
                sender_text: senderText,
                file_hash: fileHash,
            });
            await IXSubmissions.upsert({
                server_inbox_id: this.inbox.id,
                sender_uid: me,
                _dirtySender: false,
            });
            msg.update(t('inbox.postComplete'));
            await this.refreshFromServer({ silent: true });
        } catch (e) {
            console.error('Inbox post failed', e);
            msg.close();
            const isUserError = e.status >= 400 && e.status < 500;
            BBMessage.error(isUserError ? (e.message || t('inbox.postFailed')) : t('inbox.postFailed'));
        }
    },

    // ── Receiver actions ─────────────────────────────────────────

    scheduleSaveReceiver() {
        this.timers.schedule(SAVE_DEBOUNCE_KEY, async () => {
            if (!this.inbox) return;
            const row = this.submissions[this.head];
            if (!row) return;
            const text = this.elements.receiverArea?.value ?? '';
            await IXSubmissions.upsert({
                server_inbox_id: this.inbox.id,
                sender_uid: row.sender_uid,
                receiver_text: text,
                _dirtyReceiver: true,
            });
            row.receiver_text = text;
        }, T('frontend.input.bbSaveDebounce'));
    },

    async postAsReceiver() {
        const row = this.submissions[this.head];
        if (!row) return BBMessage.error(t('inbox.noSubmissionToFeedback'));

        // Same as sender path — DOM is the source of truth at the
        // moment of POST, not the (potentially stale) IDB cache.
        this.timers.cancel(SAVE_DEBOUNCE_KEY);
        const text = this.elements.receiverArea?.value ?? null;

        const msg = BBMessage.loading(t('inbox.posting'));
        try {
            await InboxService.writeFeedback(this.inbox.id, row.sender_uid, text);
            await IXSubmissions.upsert({
                server_inbox_id: this.inbox.id,
                sender_uid: row.sender_uid,
                _dirtyReceiver: false,
            });
            msg.update(t('inbox.feedbackPosted'));
            await this.refreshFromServer({ silent: true });
        } catch (e) {
            console.error('Inbox feedback post failed', e);
            msg.close();
            const isUserError = e.status >= 400 && e.status < 500;
            BBMessage.error(isUserError ? (e.message || t('inbox.feedbackPostFailed')) : t('inbox.feedbackPostFailed'));
        }
    },

    async movePush() {
        await this.flushPending();
        if (this.head > 0) this.head -= 1;
        this.renderReceiverView();
    },

    async movePull() {
        await this.flushPending();
        if (this.head < this.submissions.length - 1) this.head += 1;
        this.renderReceiverView();
    },

    // ── Cleanup ──────────────────────────────────────────────────

    async flushPending() {
        await this.timers.flush(SAVE_DEBOUNCE_KEY);
    },
};

IXThread.init();
