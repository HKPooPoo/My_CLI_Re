/**
 * Broadcast Channel - Content Controller
 * =================================================================
 * Architecture:
 *
 * OWNER mode (currentUser === channel.ownerUid && hasTitle):
 *   Editable textarea.
 *   200ms debounce → BCVcs.save() → IndexedDB (update text IN PLACE, no timestamp change).
 *   PUSH/PULL navigates local IndexedDB history.
 *
 * READER mode (everyone else, including non-logged-in):
 *   Read-only textarea.
 *   Boards fetched from server → held in memory array (serverRecords[]).
 *   PUSH/PULL navigates serverRecords[].
 *
 * BC VCS vs BB VCS:
 *   - save(): updates text in-place (no timestamp shift → position fixed).
 *   - No scrubBranch / no empty page cleanup.
 *   - isVirtual still used for new page creation via PUSH.
 *
 * Head indicator:
 *   .branch-name  → channel name
 *   .branch-head  → head index (or "NEW" in virtual mode)
 *   .branch-is-saved → "LOCAL" (uncast) | "CAST" | "UNSAVED"
 *
 * Dependencies: BCDb, BCMeta, BroadcastService, EditorAttachments
 * =================================================================
 */

import { BCDb, BCMeta, getHKTTimestamp } from './broadcast-db.js';
import { BroadcastService } from './services/broadcast-service.js';
import { EditorAttachments } from './editor-attachments.js';
import { playAudio } from './audio.js';
import { BBMessage } from './blackboard-msg.js';
import { getEcho } from './echo-service.js';
import { t } from './i18n.js';

const _readerCache = new Map();  // serverChannelId → { records, fetchedAt }
const READER_CACHE_TTL = 30_000; // 30 seconds

// --- Shared global head-indicator elements (same as BB) ---
const $branchName  = document.querySelector('.branch-name');
const $branchHead  = document.querySelector('.branch-head');
const $savedStatus = document.querySelector('.branch-is-saved');

// --- PUSH / PULL buttons (shared global, like BB) ---
const $pushBtn = document.querySelector('.push-btn');
const $pullBtn = document.querySelector('.pull-btn');

export const BCChannel = {
    elements: {
        textarea: document.getElementById('channel-textarea'),
    },

    // Current channel metadata
    currentChannel: null,   // { localId, serverChannelId, name, ownerUid, isPinned, ... }

    // VCS state (owner mode — IndexedDB backed)
    state: {
        localChannelId: null,
        currentHead: 0,
        isVirtual: false,
        maxSlot: 10,
    },

    // Reader mode — server records in memory (oldest→newest from API, reversed for head 0 = newest)
    serverRecords: [],
    readerHead: 0,

    isOwnerMode: false,
    saveTimer: null,

    // Attachment instance
    bcAttach: null,

    // Echo subscription for the currently open channel
    _echoChannel: null,

    init() {
        this.initAttachments();
        this.bindEvents();
        this.lockTextarea();
        this.clearIndicators();
    },

    // =====================================================================
    //  Attachment
    // =====================================================================

    initAttachments() {
        this.bcAttach = EditorAttachments.create({
            dropZoneSelector:    '#bc-drop-zone',
            fileInputSelector:   '#bc-file-input',
            chipsContainerSelector: '#bc-attachment-chips',
            dropOverlaySelector: '#bc-drop-overlay',
            readOnly: false,
            onAttach: async (hash, meta) => {
                if (!this.isOwnerMode || !this.currentChannel) return;
                playAudio('Cassette.mp3');
                const binData = { hash, ...meta };

                if (this.state.isVirtual) {
                    await BCDb.addRecord(this.state.localChannelId, this.elements.textarea?.value || '', binData);
                    this.state.isVirtual = false;
                    this.state.currentHead = 0;
                } else {
                    const entry = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);
                    if (entry) {
                        await BCDb.updateBinInPlace(this.state.localChannelId, entry.timestamp, binData);
                    } else if (this.state.currentHead === 0) {
                        // Fresh channel — no record exists yet (nothing typed before attaching).
                        // Create a record now so the attachment is persisted.
                        await BCDb.addRecord(this.state.localChannelId, this.elements.textarea?.value || '', binData);
                        this.state.currentHead = 0;
                    }
                }
                this.updateIndicators();
            },
            onDetach: async (hash) => {
                if (!this.isOwnerMode || !this.currentChannel) return;
                playAudio('Erase.mp3');
                if (!this.state.isVirtual) {
                    const entry = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);
                    if (entry) {
                        await BCDb.updateBinInPlace(this.state.localChannelId, entry.timestamp, null);
                    }
                }
            }
        });
    },

    // =====================================================================
    //  WebSocket Subscription
    // =====================================================================

    async _subscribeToChannel(serverChannelId) {
        if (!serverChannelId) return;
        try {
            const echo = await getEcho();
            this._echoChannel = echo.channel(`broadcast-channel.${serverChannelId}`)
                .listen('.broadcast.channel.updated', (e) => {
                    if (this.currentChannel?.serverChannelId !== e.channelId) return;

                    if (e.action === 'destroy') {
                        window.dispatchEvent(new CustomEvent('broadcast:cleared'));
                        return;
                    }
                    if (e.action === 'rename') {
                        this.currentChannel.name = e.name;
                        this.updateIndicators();
                        window.dispatchEvent(new CustomEvent('broadcast:channelRenamed', {
                            detail: { localId: this.currentChannel.localId, newName: e.name,
                                      serverChannelId: e.channelId }
                        }));
                        return;
                    }
                    // action === 'cast': invalidate cache + reload for readers
                    _readerCache.delete(e.channelId);
                    if (!this.isOwnerMode) this.loadReaderMode(this.currentChannel);
                    // Notify BCList to update sort order without a full re-fetch
                    window.dispatchEvent(new CustomEvent('broadcast:signalUpdated', {
                        detail: { serverChannelId: e.channelId, lastSignal: e.lastSignal }
                    }));
                });
        } catch (err) {
            console.error('BCChannel: subscribe failed', err);
        }
    },

    _unsubscribeFromChannel(serverChannelId) {
        if (!serverChannelId) return;
        this._echoChannel = null;
        getEcho().then(echo => echo.leaveChannel(`broadcast-channel.${serverChannelId}`)).catch(() => {});
    },

    // =====================================================================
    //  Events
    // =====================================================================

    bindEvents() {
        // Receive selected channel from broadcast-list
        window.addEventListener('broadcast:selected', (e) => {
            this.loadChannel(e.detail);
        });

        // Channel deleted → clear display
        window.addEventListener('broadcast:cleared', () => {
            this._unsubscribeFromChannel(this.currentChannel?.serverChannelId);
            this.currentChannel = null;
            this.isOwnerMode = false;
            this.lockTextarea();
            this.clearIndicators();
            this.bcAttach?.clear();
            if (this.elements.textarea) this.elements.textarea.value = '';
        });

        // Channel renamed → update indicator
        window.addEventListener('broadcast:channelRenamed', (e) => {
            if (this.currentChannel?.localId === e.detail.localId) {
                this.currentChannel.name = e.detail.newName;
                this.updateIndicators();
            }
        });

        // PUSH — check active page first to avoid interference with BB
        $pushBtn?.addEventListener('click', async () => {
            const activePage = document.querySelector('.page.active');
            if (!activePage || activePage.dataset.page !== 'broadcast-channel') return;
            await this.handlePush();
        });

        // PULL
        $pullBtn?.addEventListener('click', async () => {
            const activePage = document.querySelector('.page.active');
            if (!activePage || activePage.dataset.page !== 'broadcast-channel') return;
            await this.handlePull();
        });

        // Page switch → re-sync BC view so head indicator is always current
        window.addEventListener('navi:pageChanged', (e) => {
            if (e.detail?.page !== 'broadcast-channel') return;
            if (this.currentChannel) {
                if (this.isOwnerMode) this.syncOwnerView();
                else this.syncReaderView();
            } else {
                this.clearIndicators();
            }
        });

        // Textarea input — auto-save (owner mode only)
        this.elements.textarea?.addEventListener('input', () => {
            if (!this.isOwnerMode) return;
            if ($savedStatus) $savedStatus.textContent = t('common.unsaved');

            clearTimeout(this.saveTimer);
            this.saveTimer = setTimeout(async () => {
                await this.save(this.elements.textarea.value);
                this.updateIndicators();
            }, 200);
        });
    },

    // =====================================================================
    //  Load Channel
    // =====================================================================

    async loadChannel(channel) {
        clearTimeout(this.saveTimer);
        // Unsubscribe from previous channel before switching
        if (this.currentChannel?.serverChannelId !== channel.serverChannelId) {
            this._unsubscribeFromChannel(this.currentChannel?.serverChannelId);
        }
        playAudio('UIGeneralFocus.mp3');
        this.currentChannel = channel;

        const me = localStorage.getItem('currentUser');
        const hasTitle = !!localStorage.getItem('currentTitle');
        this.isOwnerMode = !!(me && hasTitle && channel.ownerUid === me);

        if (this.isOwnerMode) {
            await this.loadOwnerMode(channel);
        } else {
            await this.loadReaderMode(channel);
        }

        // Subscribe for live updates (works for both owner and reader)
        this._subscribeToChannel(channel.serverChannelId);
    },

    async loadOwnerMode(channel) {
        this.state.localChannelId = channel.localId;
        this.state.currentHead = 0;
        this.state.isVirtual = false;

        this.unlockTextarea();
        await this.syncOwnerView();
    },

    async loadReaderMode(channel) {
        this.serverRecords = [];
        this.readerHead = 0;
        this.lockTextarea();

        if (!channel.serverChannelId) {
            if (this.elements.textarea) this.elements.textarea.value = '';
            this.updateIndicators();
            return;
        }

        // Use cached records if still fresh
        const cached = _readerCache.get(channel.serverChannelId);
        if (cached && Date.now() - cached.fetchedAt < READER_CACHE_TTL) {
            this.serverRecords = cached.records;
            this.syncReaderView();
            return;
        }

        try {
            const data = await BroadcastService.fetchBoards(channel.serverChannelId);
            const records = (data?.records ?? []).reverse();
            this.serverRecords = records;
            _readerCache.set(channel.serverChannelId, { records, fetchedAt: Date.now() });
        } catch (e) {
            console.error('BCChannel: fetch boards failed', e);
            BBMessage.error(t('broadcast.fetchFailed'));
            this.serverRecords = [];
        }

        this.syncReaderView();
    },

    // =====================================================================
    //  PUSH / PULL
    // =====================================================================

    async handlePush() {
        if (!this.currentChannel) return;
        playAudio('UIGeneralFocus.mp3');

        if (this.isOwnerMode) {
            await this.ownerPush();
        } else {
            this.readerPush();
        }
    },

    async handlePull() {
        if (!this.currentChannel) return;
        playAudio('UIGeneralFocus.mp3');

        if (this.isOwnerMode) {
            await this.ownerPull();
        } else {
            this.readerPull();
        }
    },

    // --- Owner PUSH/PULL (IndexedDB) ---

    async ownerPush() {
        if (this.state.isVirtual) return;

        if (this.state.currentHead > 0) {
            this.state.currentHead--;
            await this.syncOwnerView();
            return;
        }

        // At Head 0: enter virtual new page mode
        this.state.isVirtual = true;
        await this.syncOwnerView();
    },

    async ownerPull() {
        if (this.state.isVirtual) {
            const text = this.elements.textarea?.value ?? '';
            if (text.trim()) {
                // Save virtual content before pulling back
                await this.save(text);
            }
            this.state.isVirtual = false;
            await this.syncOwnerView();
            return;
        }

        const count = await BCDb.countRecords(this.state.localChannelId);
        if (this.state.currentHead < count - 1) {
            this.state.currentHead++;
            await this.syncOwnerView();
        }
    },

    // --- Reader PUSH/PULL (memory array) ---

    readerPush() {
        if (this.readerHead > 0) {
            this.readerHead--;
            this.syncReaderView();
        }
    },

    readerPull() {
        if (this.readerHead < this.serverRecords.length - 1) {
            this.readerHead++;
            this.syncReaderView();
        }
    },

    // =====================================================================
    //  BC VCS Save (simplified — no timestamp update, no scrub)
    // =====================================================================

    async save(text) {
        if (!this.isOwnerMode) return;

        try {
            if (this.state.isVirtual) {
                if (text && text.trim()) {
                    await BCDb.addRecord(this.state.localChannelId, text);
                    this.state.isVirtual = false;
                    this.state.currentHead = 0;
                }
                return;
            }

            const entry = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);

            if (entry) {
                if (entry.text !== text) {
                    // BC core mechanic: update in-place, timestamp stays the same
                    await BCDb.updateTextInPlace(this.state.localChannelId, entry.timestamp, text);
                    // currentHead does NOT change — position is fixed by creation order
                }
            } else if (this.state.currentHead === 0) {
                // Initial state (no records yet)
                if (text && text.trim()) {
                    await BCDb.addRecord(this.state.localChannelId, text);
                }
            }
        } catch (e) {
            console.error('BCChannel: save failed', e);
        }
    },

    // =====================================================================
    //  View Sync
    // =====================================================================

    async syncOwnerView() {
        if (this.state.isVirtual) {
            if (this.elements.textarea) this.elements.textarea.value = '';
            this.bcAttach?.clear();
            this.updateIndicators(t('broadcast.headNew'));
            return;
        }

        try {
            const entry = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);
            if (this.elements.textarea) {
                this.elements.textarea.value = entry?.text ?? '';
            }

            // Sync attachment chip
            const bin = entry?.bin ?? null;
            const hash = (typeof bin === 'object') ? bin?.hash : bin;
            this.bcAttach?.setFromRecord(hash || null, typeof bin === 'object' ? bin : null);

            this.updateIndicators();
        } catch (e) {
            console.error('BCChannel: syncOwnerView failed', e);
        }
    },

    syncReaderView() {
        const record = this.serverRecords[this.readerHead] ?? null;
        if (this.elements.textarea) {
            this.elements.textarea.value = record?.text ?? '';
        }

        // Attachment (read-only)
        const bin = record?.bin ?? null;
        const hash = typeof bin === 'object' ? bin?.hash : bin;
        this.bcAttach?.setFromRecord(hash || null, typeof bin === 'object' ? bin : null);

        this.updateIndicators(this.readerHead);
    },

    // =====================================================================
    //  Indicators + Lock
    // =====================================================================

    updateIndicators(headOverride) {
        if (!this.currentChannel) return;

        const name = this.currentChannel.name || t('broadcast.headFallback');
        if ($branchName) {
            $branchName.textContent = name;
            if (this.currentChannel.isPinned) {
                $branchName.style.flexDirection = 'row';
                const pinSpan = document.createElement('span');
                pinSpan.className = 'crt-text-yellow';
                pinSpan.textContent = t('broadcast.pinLabel');
                $branchName.appendChild(pinSpan);
            } else {
                $branchName.style.flexDirection = '';
            }
        }

        const head = headOverride !== undefined
            ? headOverride
            : (this.isOwnerMode ? this.state.currentHead : this.readerHead);
        if ($branchHead) $branchHead.textContent = head;

        if ($savedStatus) {
            if (this.isOwnerMode) {
                $savedStatus.textContent = this.currentChannel.serverChannelId ? t('broadcast.statusCast') : t('broadcast.statusLocal');
            } else {
                $savedStatus.textContent = t('broadcast.statusRead');
            }
        }
    },

    clearIndicators() {
        if ($branchName)  $branchName.textContent  = t('broadcast.headFallback');
        if ($branchHead)  $branchHead.textContent  = t('broadcast.headFallback');
        if ($savedStatus) $savedStatus.textContent = t('broadcast.headFallback');
    },

    lockTextarea() {
        this.elements.textarea?.setAttribute('disabled', 'true');
    },

    unlockTextarea() {
        this.elements.textarea?.removeAttribute('disabled');
    }
};

// Init
BCChannel.init();
