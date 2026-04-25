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
import { getHKTTimestamp } from './utils.js';
import db from './indexedDB.js';

const SAVE_DEBOUNCE_KEY = 'inboxAutoSave';

/**
 * Compact `MM-DD HH:MM` formatter for the section timestamp badge.
 * Accepts either a server datetime string (created_at / updated_at)
 * or a bigint ms (feedback_at). Falls back to empty string for null
 * / undefined / unparseable input.
 */
function formatStamp(input) {
    if (input === null || input === undefined || input === '') return '';
    try {
        const iso = getHKTTimestamp(input);  // "2026-04-25T14:32:18.000+08:00"
        // Slice MM-DD + space + HH:MM → "04-25 14:32"
        return iso.slice(5, 10) + ' ' + iso.slice(11, 16);
    } catch {
        return '';
    }
}

export const IXThread = {
    elements: {
        page: document.querySelector('.page[data-page="inbox-thread"]'),
        wrapper: document.getElementById('inbox-drop-zone'),
        emptyOverlay: document.getElementById('inbox-empty-overlay'),
        receiverEmpty: document.getElementById('inbox-receiver-empty'),
        readOnlyBanner: document.getElementById('inbox-read-only-banner'),
        chipsArea: document.getElementById('inbox-attachment-chips'),
        previewRail: document.getElementById('inbox-preview-rail'),
        senderArea: document.getElementById('inbox-sender-textarea'),
        senderSection: document.querySelector('.inbox-textarea-section.is-submission'),
        senderUid: document.getElementById('inbox-sender-uid'),
        senderTs: document.getElementById('inbox-sender-ts'),
        receiverArea: document.getElementById('inbox-receiver-textarea'),
        receiverSection: document.querySelector('.inbox-textarea-section.is-feedback'),
        receiverUid: document.getElementById('inbox-receiver-uid'),
        receiverTs: document.getElementById('inbox-receiver-ts'),
        dropOverlay: document.getElementById('inbox-drop-overlay'),
        fileInput: document.getElementById('inbox-file-input'),
        // Per-section RESET / SAVE buttons. CSS hides the wrong-side
        // pair via `data-mode="sender|receiver"` × `.is-submission |
        // .is-feedback` so we don't need to JS-toggle perspectives.
        senderResetBtn:   document.getElementById('inbox-sender-reset-btn'),
        senderSaveBtn:    document.getElementById('inbox-sender-save-btn'),
        receiverResetBtn: document.getElementById('inbox-receiver-reset-btn'),
        receiverSaveBtn:  document.getElementById('inbox-receiver-save-btn'),
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
    /**
     * Server-authoritative eligibility flag. true = sender can POST
     * new edits; false = read-preserved (visible but write-revoked).
     * Updated on every refreshFromServer. The frontend gates
     * senderArea / POST button / file picker on this so a user
     * whose whitelist was just removed can't TYPE a change that
     * the server would refuse to commit. Receiver mode always sets
     * this true (owner override on the backend).
     */
    canSubmit: false,

    init() {
        this.bindEvents();
        this._wireDropZone();
        this._wirePreviewRailInteractions();
        // Empty overlay starts visible — JS hides it once an inbox loads
        if (this.elements.emptyOverlay) {
            this.elements.emptyOverlay.style.display = '';
        }
        this._syncGlobalButtons();
    },

    /**
     * Vestigial. Inbox-thread no longer carries the `can-push-pull`
     * class, so navi.js auto-hides the global PUSH/PULL buttons on
     * this page; submissions are reached via the preview rail and
     * each editable section ships its own RESET / SAVE pair. Kept
     * as a no-op to avoid touching the five call sites that still
     * fire it; remove in a future cleanup.
     */
    _syncGlobalButtons() {},

    /**
     * Drag-and-drop wiring on the editor-wrapper. Mirrors BB/BC's
     * dragenter / dragover / dragleave / drop counter pattern but
     * stays slim because Inbox is single-file and senders only —
     * we don't need the full EditorAttachments machinery.
     */
    _wireDropZone() {
        const zone = this.elements.wrapper;
        const overlay = this.elements.dropOverlay;
        if (!zone || !overlay) return;

        let counter = 0;
        const showOverlay = () => overlay.classList.add('active');
        const hideOverlay = () => overlay.classList.remove('active');

        zone.addEventListener('dragenter', (e) => {
            if (this.mode !== 'sender' || !this.inbox || !this.canSubmit) return;
            e.preventDefault();
            counter++;
            showOverlay();
        });
        zone.addEventListener('dragover', (e) => {
            if (this.mode !== 'sender' || !this.inbox || !this.canSubmit) return;
            e.preventDefault();
        });
        zone.addEventListener('dragleave', () => {
            if (--counter <= 0) {
                counter = 0;
                hideOverlay();
            }
        });
        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            counter = 0;
            hideOverlay();
            if (this.mode !== 'sender' || !this.inbox || !this.canSubmit) return;
            const file = e.dataTransfer?.files?.[0];
            if (file) await this.attachFile(file);
        });
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
        // Also re-sync push/pull visibility because navi.js's
        // updatePage will have just shown them based on
        // `can-push-pull`; we want the mode-aware decision instead.
        window.addEventListener('navi:pageChanged', (e) => {
            if (e.detail?.page === 'inbox-thread') {
                this._syncGlobalButtons();
                if (this.inbox) this.refreshFromServer({ silent: true });
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
                // Defensive: even if disabled is bypassed via DevTools,
                // skip the IDB write when the server says we can't submit.
                if (!this.canSubmit) return;
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

        // ── File picker (sender only) — triggered from the empty
        //    chips area when no chip is rendered, or from the chip's
        //    swap action.
        if (this.elements.fileInput) {
            this.elements.fileInput.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (file) await this.attachFile(file);
                e.target.value = ''; // reset for re-pick of same file
            });
        }
        // Click on empty chips area opens the file picker (mirrors BB/BC).
        if (this.elements.chipsArea) {
            this.elements.chipsArea.addEventListener('click', (e) => {
                if (this.mode !== 'sender' || !this.inbox || !this.canSubmit) return;
                if (e.target.closest('.attachment-chip')) return;
                this.elements.fileInput?.click();
            });
        }

        // ── Per-section RESET + SAVE pairs ──
        // The two SAVE buttons map to the two `postAs*` paths, one per
        // role. RESET is identical for both — re-fetch from server,
        // overwriting whatever's in the textarea. CSS hides the
        // wrong-side pair so the wiring is symmetric per role; JS
        // doesn't need to branch on `this.mode` here.
        const wireSave = (btn, postFn) => {
            if (!btn) return;
            new MultiStepButton(btn, {
                sound: 'UIPipboyOK.mp3',
                steps: 1,
                action: async () => {
                    if (!this.inbox) return BBMessage.error(t('inbox.noInboxSelected'));
                    return postFn.call(this);
                },
            });
        };
        const wireReset = (btn) => {
            if (!btn) return;
            new MultiStepButton(btn, {
                sound: 'UIGeneralFocus.mp3',
                steps: 1,
                action: async () => {
                    if (!this.inbox) return BBMessage.error(t('inbox.noInboxSelected'));
                    await this.refreshFromServer({ silent: false });
                },
            });
        };

        wireSave(this.elements.senderSaveBtn,   this.postAsSender);
        wireSave(this.elements.receiverSaveBtn, this.postAsReceiver);
        wireReset(this.elements.senderResetBtn);
        wireReset(this.elements.receiverResetBtn);
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

        // Hide the empty-state overlay; show the editor scaffold.
        if (this.elements.emptyOverlay) this.elements.emptyOverlay.style.display = 'none';

        await this.refreshFromServer({ silent: false });
        this._subscribeWS(inbox.id);
        this._syncGlobalButtons();
    },

    unloadInbox() {
        this._unsubscribeWS();
        this.inbox = null;
        this.submissions = [];
        this.head = 0;
        this.mode = 'sender';
        this.elements.page?.removeAttribute('data-mode');
        if (this.elements.emptyOverlay) this.elements.emptyOverlay.style.display = '';
        if (this.elements.senderArea) this.elements.senderArea.value = '';
        if (this.elements.receiverArea) this.elements.receiverArea.value = '';
        this.renderFileChip(null);
        this._syncGlobalButtons();
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

        // Snapshot pre-fetch state so we can detect transitions:
        //   - receiver: submission count grew → "new submission" toast
        //   - sender:   canSubmit flipped     → eligibility toast,
        //               feedback_at advanced  → "new feedback" toast
        const prevSubsCount = this.submissions.length;
        const prevCanSubmit = this.canSubmit;
        const prevFeedbackAt = this.submissions[0]?.feedback_at ?? null;

        try {
            if (this.mode === 'receiver') {
                const data = await InboxService.fetchSubmissions(this.inbox.id, signal);
                if (signal.aborted) return;
                this.submissions = data?.submissions ?? [];
                this.canSubmit = true;  // owner override — receiver always eligible
                await IXSubmissions.replaceForInbox(this.inbox.id, this.submissions);
                if (this.head >= this.submissions.length) this.head = Math.max(0, this.submissions.length - 1);
                this.renderReceiverView();
                this._syncGlobalButtons();
                // New-submission toast on silent re-pull. Compare counts
                // (a strict increase means at least one new row landed).
                if (silent && this.submissions.length > prevSubsCount) {
                    const newest = this.submissions[0];
                    BBMessage.info(t('inbox.newSubmissionArrived',
                        { sender: newest?.sender_uid ?? '?' }));
                }
            } else {
                const data = await InboxService.getMySubmission(this.inbox.id, signal);
                if (signal.aborted) return;
                const row = data?.submission ?? null;
                this.canSubmit = !!data?.can_submit;
                // Eligibility transition toasts (silent refresh only — a
                // user-initiated PULL already gets a 'PULLED' toast).
                if (silent && prevCanSubmit !== this.canSubmit) {
                    if (this.canSubmit) BBMessage.success(t('inbox.eligibilityGranted'));
                    else BBMessage.info(t('inbox.eligibilityRevoked'));
                }
                // New-feedback toast — owner wrote / changed feedback
                // since last fetch.
                if (silent && row?.feedback_at && row.feedback_at !== prevFeedbackAt) {
                    BBMessage.info(t('inbox.feedbackArrived',
                        { owner: this.inbox?.owner_uid ?? '?' }));
                }
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
            const status = e.status || e.response?.status;
            if (status === 403)      BBMessage.error(t('inbox.notOwner'));
            else if (status === 404) BBMessage.error(t('inbox.errInboxNotFound'));
            else                     BBMessage.error(t('inbox.pullFailed'));
        }
    },

    // ── Rendering ────────────────────────────────────────────────

    renderSenderView() {
        const row = this.submissions[0];
        const me = localStorage.getItem('currentUser') || '';
        const ownerLabel = this.inbox?.owner_uid || '';

        // Eligibility gate — disables senderArea + POST + file when
        // the user is read-preserved (had access, no longer does).
        const canWrite = this.canSubmit;

        if (this.elements.senderArea) {
            this.elements.senderArea.value = row?.sender_text ?? '';
            this.elements.senderArea.disabled = !canWrite;
        }
        if (this.elements.receiverArea) {
            this.elements.receiverArea.value = row?.receiver_text ?? '';
            this.elements.receiverArea.disabled = true;
        }
        // Read-preserved banner — only show when user is in this state
        // (has a submission to read, but no current submission rights).
        if (this.elements.readOnlyBanner) {
            const isReadPreserved = !canWrite && !!row;
            this.elements.readOnlyBanner.classList.toggle('visible', isReadPreserved);
        }
        // SAVE button on sender side: hide when can't write at all
        // (read-preserved state). RESET stays available so the user
        // can still refresh to see new feedback. CSS handles
        // perspective gating; this is the can_submit gate only.
        if (this.elements.senderSaveBtn) {
            this.elements.senderSaveBtn.style.display = canWrite ? '' : 'none';
        }
        // SUBMISSION pane: my own uid, my last submission timestamp.
        if (this.elements.senderUid) this.elements.senderUid.textContent = me;
        if (this.elements.senderTs) {
            this.elements.senderTs.textContent = formatStamp(row?.updated_at);
        }
        // FEEDBACK pane: inbox owner uid + feedback_at.
        if (this.elements.receiverUid) this.elements.receiverUid.textContent = ownerLabel;
        if (this.elements.receiverTs) {
            this.elements.receiverTs.textContent = formatStamp(row?.feedback_at);
        }

        // Feedback pane shrinks to a "no feedback yet" placeholder when
        // the inbox owner hasn't replied. Pairs with the CSS rule on
        // `.inbox-textarea-section.is-feedback.is-empty`.
        if (this.elements.receiverSection) {
            const hasFeedback = !!(row?.receiver_text && row.receiver_text.trim());
            this.elements.receiverSection.classList.toggle('is-empty', !hasFeedback);
            if (!hasFeedback) {
                this.elements.receiverSection.dataset.emptyLabel =
                    t('inbox.feedbackPending', { owner: ownerLabel });
            } else {
                delete this.elements.receiverSection.dataset.emptyLabel;
            }
        }
        // Clear the receiver-mode-only empty-submissions flag.
        this.elements.page?.removeAttribute('data-empty-submissions');
        this.renderFileChip(row?.file_hash ?? null, /*readOnly*/ false);
    },

    renderReceiverView() {
        const row = this.submissions[this.head];
        const me = localStorage.getItem('currentUser') || '';

        if (this.elements.senderArea) {
            this.elements.senderArea.value = row?.sender_text ?? '';
            this.elements.senderArea.disabled = true;
        }
        if (this.elements.receiverArea) {
            this.elements.receiverArea.value = row?.receiver_text ?? '';
            this.elements.receiverArea.disabled = false;
        }
        // Receiver mode — banner hidden. SAVE button visibility is
        // perspective-gated by CSS; we just clear any can_submit
        // override left over from a previous sender session.
        this.elements.readOnlyBanner?.classList.remove('visible');
        if (this.elements.senderSaveBtn) this.elements.senderSaveBtn.style.display = '';
        // SUBMISSION pane: current sender's uid + their last update.
        if (this.elements.senderUid) {
            this.elements.senderUid.textContent = row?.sender_uid ?? '';
        }
        if (this.elements.senderTs) {
            this.elements.senderTs.textContent = formatStamp(row?.updated_at);
        }
        // FEEDBACK pane: my own uid (= owner) + feedback_at on this row.
        if (this.elements.receiverUid) this.elements.receiverUid.textContent = me;
        if (this.elements.receiverTs) {
            this.elements.receiverTs.textContent = formatStamp(row?.feedback_at);
        }

        // Feedback pane in receiver mode is always full-size (it's the
        // owner's primary write target) — clear the sender-mode shrink.
        this.elements.receiverSection?.classList.remove('is-empty');
        // Toggle the 0-submissions empty state. CSS hides
        // .inbox-textareas and shows .inbox-receiver-empty when set.
        if (this.elements.page) {
            if (this.submissions.length === 0) {
                this.elements.page.setAttribute('data-empty-submissions', 'true');
                // Clear stamps on empty so badges hide via :empty rule.
                if (this.elements.senderUid) this.elements.senderUid.textContent = '';
                if (this.elements.senderTs) this.elements.senderTs.textContent = '';
                if (this.elements.receiverUid) this.elements.receiverUid.textContent = '';
                if (this.elements.receiverTs) this.elements.receiverTs.textContent = '';
            } else {
                this.elements.page.removeAttribute('data-empty-submissions');
            }
        }
        this.renderFileChip(row?.file_hash ?? null, /*readOnly*/ true);
        this.renderPreviewRail();
    },

    /**
     * Render the receiver-mode preview rail. Each block carries only
     * a `data-head` attribute + the rotated uid label; click and peek
     * handlers live at the rail level (set once in `init`), so this
     * function is render-only — no per-block listener wiring.
     *
     * Visual state (graded vs ungraded) is conveyed by border style
     * alone: solid brand-edge for graded, dashed accent (purple) for
     * `.unsynced` (ungraded). No glyph marker — the border carries
     * the information already.
     */
    renderPreviewRail() {
        if (!this.elements.previewRail) return;
        this.elements.previewRail.innerHTML = '';
        this.submissions.forEach((row, idx) => {
            const block = document.createElement('div');
            block.classList.add('page-preview-block');
            if (idx === this.head) block.classList.add('active');
            if (row.feedback_at === null) block.classList.add('unsynced');
            block.dataset.head = idx;
            const label = document.createElement('span');
            label.className = 'inbox-preview-block-label';
            label.textContent = row.sender_uid;
            block.appendChild(label);
            this.elements.previewRail.appendChild(block);
        });
        this.elements.previewRail
            .querySelector('.page-preview-block.active')
            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    /**
     * Rail-level peek + click + touch handlers. Mirrors the BB / BC
     * preview-rail pattern (`blackboard.js` `$previewRail.addEventListener
     * (mouseover|mouseleave|click|touchstart|touchmove|touchend)`):
     *
     *   • mouseover  → take a snapshot of the current view, lock both
     *                  textareas read-only, paint the hovered block's
     *                  submission into SUBMISSION + FEEDBACK + file chip
     *   • mouseleave → restore snapshot, unlock
     *   • click      → drop snapshot, navigate this.head to the block
     *   • touchstart → start a 300 ms timer; on fire enter peek mode
     *                  with the .peeking class (CSS analogue of :hover)
     *   • touchmove  → resolve the block under the finger via
     *                  elementFromPoint, swap peek content; movement
     *                  > 10 px before the timer cancels (treat as scroll)
     *   • touchend   → if peek was entered, restore snapshot; otherwise
     *                  fall through to native click → navigate
     *
     * Sender mode skips the wiring entirely (the rail is `display: none`
     * for senders). Active-element guard prevents the peek from
     * stealing focus while the receiver is mid-typing in FEEDBACK.
     */
    _wirePreviewRailInteractions() {
        const rail = this.elements.previewRail;
        if (!rail) return;
        let snapshot = null;

        const lock = (locked) => {
            if (this.elements.senderArea) this.elements.senderArea.readOnly = locked;
            if (this.elements.receiverArea) this.elements.receiverArea.readOnly = locked;
        };
        const clearPeekMarker = () => {
            rail.querySelectorAll('.peeking').forEach(el => el.classList.remove('peeking'));
        };
        const applyPeek = (head) => {
            const row = this.submissions[head];
            if (!row) return;
            if (this.elements.senderArea) this.elements.senderArea.value = row.sender_text ?? '';
            if (this.elements.receiverArea) this.elements.receiverArea.value = row.receiver_text ?? '';
            this.renderFileChip(row.file_hash ?? null, /*readOnly*/ true);
        };
        const restoreSnapshot = () => {
            if (!snapshot) return;
            if (this.elements.senderArea) this.elements.senderArea.value = snapshot.sender;
            if (this.elements.receiverArea) this.elements.receiverArea.value = snapshot.receiver;
            this.renderFileChip(snapshot.fileHash, /*readOnly*/ true);
            snapshot = null;
            lock(false);
            clearPeekMarker();
            // Re-apply per-mode disabled state. Receiver mode keeps
            // sender textarea disabled; the lock(false) call above
            // would otherwise leave both editable.
            if (this.mode === 'receiver' && this.elements.senderArea) {
                this.elements.senderArea.disabled = true;
            }
        };

        rail.addEventListener('mouseover', (e) => {
            if (this.mode !== 'receiver') return;
            const block = e.target.closest('.page-preview-block');
            if (!block) return;
            if (!snapshot &&
                (document.activeElement === this.elements.receiverArea ||
                 document.activeElement === this.elements.senderArea)) return;
            const head = parseInt(block.dataset.head, 10);
            if (Number.isNaN(head) || head < 0) return;
            if (!snapshot) {
                const row = this.submissions[this.head];
                snapshot = {
                    sender:   this.elements.senderArea?.value ?? '',
                    receiver: this.elements.receiverArea?.value ?? '',
                    fileHash: row?.file_hash ?? null,
                };
                lock(true);
            }
            applyPeek(head);
        });
        rail.addEventListener('mouseleave', () => {
            restoreSnapshot();
        });

        rail.addEventListener('click', async (e) => {
            const block = e.target.closest('.page-preview-block');
            if (!block) return;
            const head = parseInt(block.dataset.head, 10);
            if (Number.isNaN(head) || head < 0) return;
            if (snapshot) {
                snapshot = null;
                lock(false);
                clearPeekMarker();
            }
            await this.flushPending();
            this.head = head;
            this.renderReceiverView();
        });

        // Mobile touch peek — 300 ms hold opens peek; touchmove tracks
        // the block under the finger via elementFromPoint.
        let touchTimer = null;
        let touchStartPos = null;
        let inTouchPeek = false;
        const peekBlockFromPoint = (x, y) => {
            const el = document.elementFromPoint(x, y);
            return el?.closest?.('.page-preview-block') || null;
        };

        rail.addEventListener('touchstart', (e) => {
            if (this.mode !== 'receiver') return;
            const touch = e.touches[0];
            if (!touch) return;
            touchStartPos = { x: touch.clientX, y: touch.clientY };
            const block = e.target.closest('.page-preview-block');
            if (!block) return;
            clearTimeout(touchTimer);
            touchTimer = setTimeout(() => {
                if (!snapshot) {
                    const row = this.submissions[this.head];
                    snapshot = {
                        sender:   this.elements.senderArea?.value ?? '',
                        receiver: this.elements.receiverArea?.value ?? '',
                        fileHash: row?.file_hash ?? null,
                    };
                    lock(true);
                }
                inTouchPeek = true;
                const head = parseInt(block.dataset.head, 10);
                if (!Number.isNaN(head) && head >= 0) {
                    clearPeekMarker();
                    block.classList.add('peeking');
                    applyPeek(head);
                }
            }, 300);
        });
        rail.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            if (!t) return;
            if (touchStartPos && !inTouchPeek) {
                const dx = Math.abs(t.clientX - touchStartPos.x);
                const dy = Math.abs(t.clientY - touchStartPos.y);
                if (dx > 10 || dy > 10) {
                    clearTimeout(touchTimer);
                    touchStartPos = null;
                    return;
                }
            }
            if (!inTouchPeek) return;
            const block = peekBlockFromPoint(t.clientX, t.clientY);
            if (!block) return;
            const head = parseInt(block.dataset.head, 10);
            if (!Number.isNaN(head) && head >= 0) {
                clearPeekMarker();
                block.classList.add('peeking');
                applyPeek(head);
            }
        });
        const touchEnd = () => {
            clearTimeout(touchTimer);
            if (inTouchPeek) {
                restoreSnapshot();
                inTouchPeek = false;
            }
            touchStartPos = null;
        };
        rail.addEventListener('touchend', touchEnd);
        rail.addEventListener('touchcancel', touchEnd);
    },

    /**
     * Render the file chip into `.attachment-chips` using the same
     * class structure BB / BC use, so the standard chip styling
     * (state colours, hover, etc.) applies for free. 1-file max:
     * we wipe the chips area and append at most one chip.
     *
     * Read-only mode (receiver viewing a sender's file) skips the
     * remove button — `.attachment-chips.readonly` triggers the
     * standard "no remove" CSS rule too.
     */
    renderFileChip(hash, readOnly = false) {
        const wrap = this.elements.chipsArea;
        if (!wrap) return;
        wrap.innerHTML = '';
        wrap.classList.toggle('readonly', !!readOnly);

        if (!hash) {
            wrap.classList.remove('has-items');
            return;
        }
        wrap.classList.add('has-items');

        const chip = document.createElement('div');
        chip.className = 'attachment-chip is-synced';
        chip.dataset.hash = hash;

        const top = document.createElement('div');
        top.className = 'attachment-chip-top';

        const icon = document.createElement('a');
        icon.className = 'attachment-chip-icon';
        icon.href = `/api/files/${hash}?inline=1`;
        icon.target = '_blank';
        icon.rel = 'noopener';
        icon.textContent = '📎';
        top.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'attachment-chip-name';
        name.textContent = hash.substring(0, 12) + '…';
        top.appendChild(name);

        if (!readOnly) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'attachment-chip-remove';
            remove.textContent = '×';
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                this.detachFile();
            });
            top.appendChild(remove);
        }
        chip.appendChild(top);
        wrap.appendChild(chip);
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
            const status = e.status || e.response?.status;
            if (status === 403) {
                BBMessage.error(t('inbox.errNotAuthorisedSubmit'));
                // Force-refresh so the UI catches up to the
                // server's revoked-eligibility state immediately
                // — banner appears, button hides.
                await this.refreshFromServer({ silent: true });
            } else if (status === 404) {
                BBMessage.error(t('inbox.errInboxNotFound'));
            } else {
                BBMessage.error(t('inbox.postFailed'));
            }
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
            const status = e.status || e.response?.status;
            if (status === 403)      BBMessage.error(t('inbox.notOwner'));
            else if (status === 404) BBMessage.error(t('inbox.errInboxNotFound'));
            else                     BBMessage.error(t('inbox.feedbackPostFailed'));
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
