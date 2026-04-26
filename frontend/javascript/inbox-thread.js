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
import { attachContentSearch } from './content-search.js';
import { EditorAttachments } from './editor-attachments.js';
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
        // YYYY-MM-DD HH:MM
        return iso.slice(0, 10) + ' ' + iso.slice(11, 16);
    } catch {
        return '';
    }
}

export const IXThread = {
    elements: {
        page: document.querySelector('.page[data-page="inbox-thread"]'),
        // WT-style three-window layout. Each window = `.inbox-window`
        // with own editor-wrapper. Element refs mirror the HTML IDs;
        // CSS perspective gate controls which windows' action pairs show.
        page:           document.querySelector('.page[data-page="inbox-thread"]'),
        emptyOverlay:   document.getElementById('inbox-empty-overlay'),
        // receiverEmpty removed — no mode-specific placeholders
        readOnlyBanner: document.getElementById('inbox-read-only-banner'),
        previewRail:    document.getElementById('inbox-preview-rail'),

        // Window 1 — INSTRUCTION
        instructionZone:      document.getElementById('inbox-instruction-zone'),
        instructionChips:     document.getElementById('inbox-instruction-chips'),
        instructionArea:      document.getElementById('inbox-instruction-textarea'),
        instructionFileInput: document.getElementById('inbox-instruction-file-input'),
        instructionDropOverlay: document.getElementById('inbox-instruction-drop-overlay'),
        instructionResetBtn:  document.getElementById('inbox-instruction-reset-btn'),
        instructionSaveBtn:   document.getElementById('inbox-instruction-save-btn'),

        // Window 2 — SUBMISSION
        submissionZone:  document.getElementById('inbox-submission-zone'),
        chipsArea:       document.getElementById('inbox-attachment-chips'),
        senderArea:      document.getElementById('inbox-sender-textarea'),
        senderUid:       document.getElementById('inbox-sender-uid'),
        senderTs:        document.getElementById('inbox-sender-ts'),
        fileInput:       document.getElementById('inbox-file-input'),
        dropOverlay:     document.getElementById('inbox-drop-overlay'),
        senderResetBtn:  document.getElementById('inbox-sender-reset-btn'),
        senderSaveBtn:   document.getElementById('inbox-sender-save-btn'),

        // Window 3 — FEEDBACK
        feedbackZone:    document.getElementById('inbox-feedback-zone'),
        receiverArea:    document.getElementById('inbox-receiver-textarea'),
        receiverSection: document.querySelector('.inbox-window.is-feedback'),
        receiverUid:     document.getElementById('inbox-receiver-uid'),
        receiverTs:      document.getElementById('inbox-receiver-ts'),
        receiverResetBtn: document.getElementById('inbox-receiver-reset-btn'),
        receiverSaveBtn:  document.getElementById('inbox-receiver-save-btn'),
    },

    /** Currently loaded inbox metadata (server snapshot) */
    inbox: null,
    /** 'sender' | 'receiver' — derived from owner_uid */
    mode: 'sender',
    /** Head index into `members` array (which member is displayed) */
    head: 0,
    /** Full whitelist roster (uid-asc). Rail renders from this, NOT
     *  from submissions — so unsubmitted members appear as blocks. */
    members: [],
    /** Actual submission rows. Lookup by sender_uid to pair with member. */
    submissions: [],
    /** Content search instance (attached to preview rail). */
    _search: null,
    /** EditorAttachments for INSTRUCTION window (≤10 files). */
    _instructionAttach: null,
    /** EditorAttachments for SUBMISSION window (≤1 file). */
    _submissionAttach: null,
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
        this._wireInstructionAttachments();
        this._wireSubmissionAttachments();
        this._wirePreviewRailInteractions();

        // Content search — searches BOTH uid and submission text so
        // the lecturer can find "S20260003" or "final report" from
        // the same pill. Placement = rail (same as BB/BC).
        this._search = attachContentSearch({
            root: this.elements.previewRail,
            placement: 'rail',
            getRecords: () => this.members.map(uid => {
                const sub = this.submissions.find(s => s.sender_uid === uid);
                return { text: `${uid} ${sub?.sender_text ?? ''}` };
            }),
            getCurrentHead: () => this.head,
            navigateTo: async (head) => {
                await this.flushPending();
                this.head = head;
                if (this.mode === 'receiver') this.renderReceiverView();
                else this.renderSenderView();
            },
        });

        // Empty overlay starts visible — JS hides it once an inbox loads
        if (this.elements.emptyOverlay) {
            this.elements.emptyOverlay.style.display = '';
        }
        this._syncGlobalButtons();
    },

    /**
     * Show / hide the global NEWER / OLDER buttons. `can-push-pull`
     * is on the page so navi.js shows them by default, but we only
     * want them when the receiver has ≥ 2 submissions to navigate.
     * Sender mode or ≤ 1 submission → hide.
     */
    /**
     * Relabel the global NEWER/OLDER buttons to FORMER/LATTER when
     * the inbox-thread page is active. Inbox navigates between
     * students (not between pages), so the label should reflect
     * "previous student / next student" rather than "newer / older".
     * Restores original text when leaving the page.
     */
    _relabelNavButtons(entering) {
        const push = document.querySelector('.push-btn');
        const pull = document.querySelector('.pull-btn');
        if (!push || !pull) return;
        if (entering) {
            push._origText = push._origText ?? push.textContent;
            pull._origText = pull._origText ?? pull.textContent;
            push.textContent = t('inbox.formerBtn');
            pull.textContent = t('inbox.latterBtn');
        } else if (push._origText) {
            push.textContent = push._origText;
            pull.textContent = pull._origText;
        }
    },

    /**
     * Wire EditorAttachments for the INSTRUCTION window — same
     * pattern as BB's `bbAttach` (editor-attachments.js). Instruction
     * supports ≤10 files (RECORD_MAX_FILES). Files are staged locally
     * in IDB; SUBMIT uploads unsynced blobs then sends the hash array
     * via PATCH /api/inboxes/{id}.
     */
    _wireInstructionAttachments() {
        this._instructionAttach = EditorAttachments.create({
            dropZoneSelector:      '#inbox-instruction-textarea',
            fileInputSelector:     '#inbox-instruction-file-input',
            chipsContainerSelector:'#inbox-instruction-chips',
            dropOverlaySelector:   '#inbox-instruction-drop-overlay',
            onAttach: async (hash, meta) => {
                if (this.mode !== 'receiver') return;
            },
            onDetach: async (hash) => {
                if (this.mode !== 'receiver') return;
            },
            onRename: async (oldHash, newHash, meta) => {
                if (this.mode !== 'receiver') return;
            },
        });
    },

    /**
     * Wire EditorAttachments for the SUBMISSION window — maxFiles: 1.
     * Same pattern as instruction but single-file constraint enforced
     * via EditorAttachments' new maxFiles config.
     */
    _wireSubmissionAttachments() {
        this._submissionAttach = EditorAttachments.create({
            dropZoneSelector:       '#inbox-sender-textarea',
            fileInputSelector:      '#inbox-file-input',
            chipsContainerSelector: '#inbox-attachment-chips',
            dropOverlaySelector:    '#inbox-drop-overlay',
            maxFiles: 1,
            onAttach: async (hash, meta) => {
                if (this.mode !== 'sender' || !this.canSubmit) return;
            },
            onDetach: async (hash) => {
                if (this.mode !== 'sender' || !this.canSubmit) return;
            },
            onRename: async (oldHash, newHash, meta) => {
                if (this.mode !== 'sender' || !this.canSubmit) return;
            },
        });
    },

    _syncGlobalButtons() {
        const pushBtn = document.querySelector('.push-btn');
        const pullBtn = document.querySelector('.pull-btn');
        if (!pushBtn || !pullBtn) return;
        const activePage = document.querySelector('.page.active');
        const isInboxThread = activePage?.dataset.page === 'inbox-thread';
        const shouldShow = isInboxThread
            && this.members.length > 1;
        if (shouldShow) {
            pushBtn.style.transform = 'translateY(0)';
            pullBtn.style.transform = 'translateY(0)';
        } else if (isInboxThread) {
            pushBtn.style.transform = 'translateY(-256%)';
            pullBtn.style.transform = 'translateY(256%)';
        }
    },

    /**
     * Drag-and-drop wiring on the editor-wrapper. Mirrors BB/BC's
     * dragenter / dragover / dragleave / drop counter pattern but
     * stays slim because Inbox is single-file and senders only —
     * we don't need the full EditorAttachments machinery.
     */
    // _wireDropZone retired — EditorAttachments handles drag/drop
    // for both instruction + submission windows.

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
                this._relabelNavButtons(true);
                if (this.inbox) this.refreshFromServer({ silent: true });
            } else {
                this._relabelNavButtons(false);
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

        // File picker + chips click + drop are all handled by
        // EditorAttachments (instruction + submission instances).

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

        // Instruction pane SUBMIT pushes the per-inbox description to
        // the server (PATCH /api/inboxes/{id}). RESET restores the
        // textarea from the in-memory inbox object — no fetch round-
        // trip needed for the per-session "discard local edits"
        // semantic. Cross-tab freshness arrives on the next inbox-list
        // re-fetch (silently triggered by inbox:signalUpdated WS).
        if (this.elements.instructionSaveBtn) {
            new MultiStepButton(this.elements.instructionSaveBtn, {
                sound: 'UIPipboyOK.mp3',
                steps: 1,
                action: async () => {
                    if (!this.inbox) return BBMessage.error(t('inbox.noInboxSelected'));
                    return this.postAsInstruction();
                },
            });
        }
        if (this.elements.instructionResetBtn) {
            new MultiStepButton(this.elements.instructionResetBtn, {
                sound: 'UIGeneralFocus.mp3',
                steps: 1,
                action: async () => {
                    if (!this.inbox || !this.elements.instructionArea) return;
                    this.elements.instructionArea.value = this.inbox.description ?? '';
                },
            });
        }

        // ── Global NEWER / OLDER for receiver-mode submission navigation ──
        // `can-push-pull` is on the page, so navi.js shows the global
        // `.push-btn` / `.pull-btn`. We wire click handlers that move
        // through submissions (= different students).
        document.querySelector('.push-btn')?.addEventListener('click', () => {
            if (!this.inbox || this.members.length <= 1) return;
            const activePage = document.querySelector('.page.active');
            if (activePage?.dataset.page !== 'inbox-thread') return;
            this.movePush();
        });
        document.querySelector('.pull-btn')?.addEventListener('click', () => {
            if (!this.inbox || this.members.length <= 1) return;
            const activePage = document.querySelector('.page.active');
            if (activePage?.dataset.page !== 'inbox-thread') return;
            this.movePull();
        });
    },

    // ── Loading / unloading ──────────────────────────────────────

    async loadInbox(inbox) {
        // Set state SYNCHRONOUSLY before any await — feature-shelf
        // re-evaluates shouldShow on the same `inbox:selected` event
        // and reads IXThread.inbox to decide whether to surface the
        // Whitelist button. If we set this.inbox after an await, the
        // synchronous shouldShow eval happens BEFORE the assignment
        // and the button stays hidden until the next page change.
        this.inbox = inbox;
        const me = localStorage.getItem('currentUser');
        this.mode = (me && inbox.owner_uid === me) ? 'receiver' : 'sender';
        this.elements.page?.setAttribute('data-mode', this.mode);

        // Persist any pending edits from the old inbox before switching
        await this.flushPending();
        this._unsubscribeWS();

        // Hide the empty-state overlay; show the editor scaffold.
        if (this.elements.emptyOverlay) this.elements.emptyOverlay.style.display = 'none';

        await this.refreshFromServer({ silent: false });
        this._subscribeWS(inbox.id);
        this._syncGlobalButtons();
    },

    unloadInbox() {
        this._unsubscribeWS();
        this.inbox = null;
        this.members = [];
        this.submissions = [];
        this.head = 0;
        this.mode = 'sender';
        this.elements.page?.removeAttribute('data-mode');
        if (this.elements.emptyOverlay) this.elements.emptyOverlay.style.display = '';
        if (this.elements.instructionArea) this.elements.instructionArea.value = '';
        if (this.elements.senderArea) this.elements.senderArea.value = '';
        if (this.elements.receiverArea) this.elements.receiverArea.value = '';
        if (this.elements.instructionUid) this.elements.instructionUid.textContent = '';
        this._instructionAttach?.setFromRecord({ file_hash: null });
        this._submissionAttach?.setFromRecord({ file_hash: null });
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
                this.members = data?.members ?? [];
                this.submissions = data?.submissions ?? [];
                this.canSubmit = true;
                await IXSubmissions.replaceForInbox(this.inbox.id, this.submissions);
                if (this.head >= this.members.length) this.head = Math.max(0, this.members.length - 1);
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
                this.members = data?.members ?? [];
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
                // Set head to own position in member roster (or 0).
                const me2 = localStorage.getItem('currentUser');
                this.head = Math.max(0, this.members.indexOf(me2));
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
        const currentUid = this.members[this.head] ?? null;
        const row = this.submissions.find(s => s.sender_uid === currentUid) || null;
        const me = localStorage.getItem('currentUser') || '';
        const ownerLabel = this.inbox?.owner_uid || '';

        // Eligibility gate — disables senderArea + POST + file when
        // the user is read-preserved (had access, no longer does).
        const canWrite = this.canSubmit;

        // INSTRUCTION pane: per-inbox content. Sender = read-only.
        if (this.elements.instructionArea) {
            this.elements.instructionArea.value = this.inbox?.description ?? '';
            this.elements.instructionArea.disabled = true;
        }
        if (this.elements.instructionUid) {
            this.elements.instructionUid.textContent = ownerLabel;
        }
        // Instruction files — read-only for sender.
        if (this._instructionAttach) {
            this._instructionAttach.setReadOnly(true);
            const fileHash = this.inbox?.instruction_files;
            this._instructionAttach.setFromRecord({ file_hash: fileHash ?? null });
        }

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
        // SUBMISSION pane: show WHICH member is selected (not always "me").
        if (this.elements.senderUid) this.elements.senderUid.textContent = currentUid ?? '';
        if (this.elements.senderTs) {
            this.elements.senderTs.textContent = formatStamp(row?.updated_at);
        }
        // FEEDBACK pane: owner uid + feedback_at for this member.
        if (this.elements.receiverUid) this.elements.receiverUid.textContent = ownerLabel;
        if (this.elements.receiverTs) {
            this.elements.receiverTs.textContent = formatStamp(row?.feedback_at);
        }

        // No mode-specific placeholders. Empty textarea = empty state.
        // Chip is read-only when the sender can no longer write
        // (read-preserved state — whitelist removed, existing row
        // visible but no edit / detach allowed). Gate matches the
        // textarea/save-button visibility above.
        if (this._submissionAttach) {
            this._submissionAttach.setReadOnly(!canWrite);
            this._submissionAttach.setFromRecord({ file_hash: row?.file_hash ?? null });
        }
        this.renderPreviewRail();
        this._search?.refresh();
    },

    renderReceiverView() {
        const currentUid = this.members[this.head] ?? null;
        const row = this.submissions.find(s => s.sender_uid === currentUid) || null;
        const me = localStorage.getItem('currentUser') || '';

        // INSTRUCTION pane: receiver (= owner) edits.
        if (this.elements.instructionArea) {
            this.elements.instructionArea.value = this.inbox?.description ?? '';
            this.elements.instructionArea.disabled = false;
        }
        if (this.elements.instructionUid) {
            this.elements.instructionUid.textContent = me;
        }
        // Instruction files — editable for receiver.
        if (this._instructionAttach) {
            this._instructionAttach.setReadOnly(false);
            const fileHash = this.inbox?.instruction_files;
            this._instructionAttach.setFromRecord({ file_hash: fileHash ?? null });
        }

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
            this.elements.senderUid.textContent = currentUid ?? '';
        }
        if (this.elements.senderTs) {
            this.elements.senderTs.textContent = formatStamp(row?.updated_at);
        }
        // FEEDBACK pane: my own uid (= owner) + feedback_at on this row.
        if (this.elements.receiverUid) this.elements.receiverUid.textContent = me;
        if (this.elements.receiverTs) {
            this.elements.receiverTs.textContent = formatStamp(row?.feedback_at);
        }

        // No mode-specific placeholders. Empty textarea = empty state.
        if (this._submissionAttach) {
            this._submissionAttach.setReadOnly(true);
            this._submissionAttach.setFromRecord({ file_hash: row?.file_hash ?? null });
        }
        this.renderPreviewRail();
        this._search?.refresh();
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
        // Mirror BB's renderPreviewRail exactly: fragment build,
        // remove only blocks, insertBefore search pill. No text
        // labels inside blocks — blocks are plain colored bars,
        // UID shows in the SUBMISSION window title on select/peek.
        this.elements.previewRail
            .querySelectorAll('.page-preview-block')
            .forEach(b => b.remove());
        const search = this.elements.previewRail.querySelector('.editor-search');
        const frag = document.createDocumentFragment();
        this.members.forEach((uid, idx) => {
            const block = document.createElement('div');
            let cls = 'page-preview-block';
            if (idx === this.head) cls += ' active';
            const sub = this.submissions.find(s => s.sender_uid === uid);
            if (!sub || sub.feedback_at === null) cls += ' unsynced';
            block.className = cls;
            block.dataset.head = String(idx);
            frag.appendChild(block);
        });
        if (search) this.elements.previewRail.insertBefore(frag, search);
        else this.elements.previewRail.appendChild(frag);
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
            const uid = this.members[head];
            const row = uid ? this.submissions.find(s => s.sender_uid === uid) : null;
            if (this.elements.senderArea) this.elements.senderArea.value = row?.sender_text ?? '';
            if (this.elements.receiverArea) this.elements.receiverArea.value = row?.receiver_text ?? '';
            if (this.elements.senderUid) this.elements.senderUid.textContent = uid ?? '';
            if (this.elements.senderTs) this.elements.senderTs.textContent = formatStamp(row?.updated_at);
            if (this.elements.receiverTs) this.elements.receiverTs.textContent = formatStamp(row?.feedback_at);
            if (this._submissionAttach) {
            this._submissionAttach.setReadOnly(true);
            this._submissionAttach.setFromRecord({ file_hash: row?.file_hash ?? null });
        }
        };
        const restoreSnapshot = () => {
            if (!snapshot) return;
            if (this.elements.senderArea) this.elements.senderArea.value = snapshot.sender;
            if (this.elements.receiverArea) this.elements.receiverArea.value = snapshot.receiver;
            if (this.elements.senderUid) this.elements.senderUid.textContent = snapshot.senderUid;
            if (this.elements.senderTs) this.elements.senderTs.textContent = snapshot.senderTs;
            if (this.elements.receiverTs) this.elements.receiverTs.textContent = snapshot.receiverTs;
            if (this._submissionAttach) {
                this._submissionAttach.setReadOnly(true);
                this._submissionAttach.setFromRecord({ file_hash: snapshot.fileHash });
            }
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
            if (!this.inbox || this.members.length <= 1) return;
            const block = e.target.closest('.page-preview-block');
            if (!block) return;
            if (!snapshot &&
                (document.activeElement === this.elements.receiverArea ||
                 document.activeElement === this.elements.senderArea)) return;
            const head = parseInt(block.dataset.head, 10);
            if (Number.isNaN(head) || head < 0) return;
            if (!snapshot) {
                const uid = this.members[this.head];
                const row = uid ? this.submissions.find(s => s.sender_uid === uid) : null;
                snapshot = {
                    sender:     this.elements.senderArea?.value ?? '',
                    receiver:   this.elements.receiverArea?.value ?? '',
                    fileHash:   row?.file_hash ?? null,
                    senderUid:  this.elements.senderUid?.textContent ?? '',
                    senderTs:   this.elements.senderTs?.textContent ?? '',
                    receiverTs: this.elements.receiverTs?.textContent ?? '',
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
            if (!this.inbox || this.members.length <= 1) return;
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

    async postAsSender() {
        const me = localStorage.getItem('currentUser');
        if (!me) return BBMessage.error(t('inbox.loginRequired'));

        // Read from DOM + in-memory state, not from IDB. This sidesteps
        // any race between an in-flight 200ms debounce write and the
        // POST: whatever is on screen now is what we send.
        this.timers.cancel(SAVE_DEBOUNCE_KEY);
        const senderText = this.elements.senderArea?.value ?? '';
        const fileHash = this._submissionAttach?.currentHash ?? null;

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

    /**
     * Push the per-inbox instruction (= `inboxes.description`) to the
     * server. Receiver-only path. Read-modify-write on a single column;
     * no IDB caching layer because the instruction is inbox-level
     * metadata, not per-submission content. RESET on this pane just
     * restores the textarea from `this.inbox.description` — no fetch.
     */
    async postAsInstruction() {
        const newDescription = this.elements.instructionArea?.value ?? '';
        const hashes = this._instructionAttach?.currentHashes ?? [];
        const msg = BBMessage.loading(t('inbox.posting'));
        try {
            // Upload any local-only blobs before sending hashes to server
            for (const hash of hashes) {
                const blob = await db.file_blobs.get(hash);
                if (blob && blob.status !== 'synced' && blob.blob) {
                    await FileService.upload(blob.blob, blob.name);
                    await db.file_blobs.update(hash, { status: 'synced' });
                }
            }
            const fileHashJson = hashes.length > 0 ? JSON.stringify(hashes) : null;
            await InboxService.update(this.inbox.id, {
                description: newDescription,
                instruction_files: fileHashJson,
            });
            this.inbox.description = newDescription;
            this.inbox.instruction_files = fileHashJson;
            msg.update(t('inbox.postComplete'));
        } catch (e) {
            console.error('Inbox instruction post failed', e);
            msg.close();
            const status = e.status || e.response?.status;
            if (status === 403)      BBMessage.error(t('inbox.notOwner'));
            else if (status === 404) BBMessage.error(t('inbox.errInboxNotFound'));
            else                     BBMessage.error(t('inbox.postFailed'));
        }
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
        if (this.mode === 'receiver') this.renderReceiverView();
        else this.renderSenderView();
    },

    async movePull() {
        await this.flushPending();
        if (this.head < this.members.length - 1) this.head += 1;
        if (this.mode === 'receiver') this.renderReceiverView();
        else this.renderSenderView();
    },

    // ── Cleanup ──────────────────────────────────────────────────

    async flushPending() {
        await this.timers.flush(SAVE_DEBOUNCE_KEY);
    },
};

IXThread.init();
