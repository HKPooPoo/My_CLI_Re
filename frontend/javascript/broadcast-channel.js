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
import { T } from './timing.js';
import { BOARD_MAX_SLOT } from './settings.js';
import { TimerGroup } from './timer-group.js';
import { MultiStepButton } from './multiStepButton.js';
import db from './indexedDB.js';
import * as CrossTabSync from './cross-tab-sync.js';

const _readerCache = new Map();  // serverChannelId → { records, fetchedAt }

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

    // VCS state (owner mode — IndexedDB backed). Tier 18 removed the
    // per-scope maxSlot setting — BC uses the hardcoded BOARD_MAX_SLOT.
    state: {
        localChannelId: null,
        currentHead: 0,
        isVirtual: false,
        currentFileHash: null,
    },

    // Reader mode — server records in memory (oldest→newest from API, reversed for head 0 = newest)
    serverRecords: [],
    readerHead: 0,

    isOwnerMode: false,
    timers: new TimerGroup(),

    // Attachment instance
    bcAttach: null,

    // Echo subscription for the currently open channel
    _echoChannel: null,

    init() {
        this.initAttachments();
        this.bindEvents();
        this.lockTextarea();
        this.clearIndicators();
        // DELETE PAGE defaults hidden until a channel is opened in owner mode.
        const $del = document.getElementById('bc-delete-page-btn');
        if ($del) $del.style.display = 'none';
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

                let touchedTimestamp = null;
                if (this.state.isVirtual) {
                    await BCDb.addRecord(this.state.localChannelId, this.elements.textarea?.value || '', binData);
                    this.state.isVirtual = false;
                    this.state.currentHead = 0;
                } else {
                    const entry = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);
                    if (entry) {
                        await BCDb.updateBinInPlace(this.state.localChannelId, entry.timestamp, binData);
                        touchedTimestamp = entry.timestamp;
                    } else if (this.state.currentHead === 0) {
                        // Fresh channel — no record exists yet (nothing typed before attaching).
                        // Create a record now so the attachment is persisted.
                        await BCDb.addRecord(this.state.localChannelId, this.elements.textarea?.value || '', binData);
                        this.state.currentHead = 0;
                    }
                }
                this.updateIndicators();
                CrossTabSync.broadcast('bc:record:mutated', {
                    localChannelId: this.state.localChannelId,
                    timestamp: touchedTimestamp
                });
            },
            onDetach: async (hash) => {
                if (!this.isOwnerMode || !this.currentChannel) return;
                playAudio('Erase.mp3');
                let touchedTimestamp = null;
                if (!this.state.isVirtual) {
                    const entry = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);
                    if (entry) {
                        await BCDb.updateBinInPlace(this.state.localChannelId, entry.timestamp, null);
                        touchedTimestamp = entry.timestamp;
                    }
                }
                CrossTabSync.broadcast('bc:record:mutated', {
                    localChannelId: this.state.localChannelId,
                    timestamp: touchedTimestamp
                });
            },
            onRename: async (oldHash, newHash, meta) => {
                if (!this.isOwnerMode || !this.currentChannel) return;
                if (this.state.isVirtual) return;
                const entry = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);
                if (!entry) return;
                const existing = entry.file_hash;
                const h = (typeof existing === 'object') ? existing?.hash : existing;
                if (h !== oldHash) return;
                const binData = { hash: newHash, ...meta };
                await BCDb.updateBinInPlace(this.state.localChannelId, entry.timestamp, binData);
                this.updateIndicators();
                CrossTabSync.broadcast('bc:record:mutated', {
                    localChannelId: this.state.localChannelId,
                    timestamp: entry.timestamp
                });
            }
        });

        // Cross-tab sync: another tab on this device mutated a BC record.
        // Refresh owner view if the change is for the channel we're viewing.
        CrossTabSync.on('bc:record:mutated', (detail) => {
            if (!detail || !this.isOwnerMode || !this.currentChannel) return;
            if (detail.localChannelId !== this.state.localChannelId) return;
            const textarea = this.elements?.textarea;
            const isTyping = textarea && document.activeElement === textarea;
            if (!isTyping && this.currentChannel) {
                this.loadOwnerMode(this.currentChannel);
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
                    if (this.currentChannel?.serverChannelId !== e.channel_id) return;

                    if (e.action === 'destroy') {
                        window.dispatchEvent(new CustomEvent('broadcast:cleared'));
                        return;
                    }
                    if (e.action === 'rename') {
                        this.currentChannel.name = e.name;
                        this.updateIndicators();
                        window.dispatchEvent(new CustomEvent('broadcast:channelRenamed', {
                            detail: { localId: this.currentChannel.localId, newName: e.name,
                                      serverChannelId: e.channel_id }
                        }));
                        return;
                    }
                    _readerCache.delete(e.channel_id);
                    if (!this.isOwnerMode) this.loadReaderMode(this.currentChannel);
                    window.dispatchEvent(new CustomEvent('broadcast:signalUpdated', {
                        detail: { serverChannelId: e.channel_id, lastSignal: e.last_signal }
                    }));
                });
        } catch (err) {
            console.error('BCChannel: subscribe failed', err);
            BBMessage.info(t('broadcast.realtimeUnavailable'));
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
            // Skip redundant load if same channel re-selected (e.g. after re-render)
            if (this.currentChannel?.localId === e.detail.localId) return;
            this.loadChannel(e.detail);
        });

        // Auth change → full teardown (mirrors broadcast:cleared)
        window.addEventListener('auth:updated', () => {
            this.timers.cancelAll();
            this._unsubscribeFromChannel(this.currentChannel?.serverChannelId);
            this.currentChannel = null;
            this.isOwnerMode = false;
            this.serverRecords = [];
            this.readerHead = 0;
            this.lockTextarea();
            this.clearIndicators();
            this.bcAttach?.clear();
            if (this.elements.textarea) this.elements.textarea.value = '';
            this._previewRailCache = [];
            const rail = document.getElementById('bc-preview-rail');
            if (rail) rail.replaceChildren();
            const $bcDel = document.getElementById('bc-delete-page-btn');
            if ($bcDel) $bcDel.style.display = 'none';
        });

        // Channel deleted → clear display
        window.addEventListener('broadcast:cleared', () => {
            this.timers.cancelAll();
            this._unsubscribeFromChannel(this.currentChannel?.serverChannelId);
            this.currentChannel = null;
            this.isOwnerMode = false;
            this.lockTextarea();
            this.clearIndicators();
            this.bcAttach?.clear();
            if (this.elements.textarea) this.elements.textarea.value = '';
            this._previewRailCache = [];
            const rail = document.getElementById('bc-preview-rail');
            if (rail) rail.replaceChildren();
            const $bcDel = document.getElementById('bc-delete-page-btn');
            if ($bcDel) $bcDel.style.display = 'none';
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

        // Tier 18: maxSlot setting removed — BOARD_MAX_SLOT is hardcoded.

        // Textarea input — auto-save (owner mode only)
        this.elements.textarea?.addEventListener('input', () => {
            if (!this.isOwnerMode) return;
            if ($savedStatus) $savedStatus.textContent = t('common.unsaved');

            this.timers.schedule('save', async () => {
                await this.save(this.elements.textarea.value);
                this.updateIndicators();
            }, T('frontend.input.bcSaveDebounce'));
        });

        // Page Previewer rail (BC) — hover peeks, click navigates. Owner
        // mode saves current before navigating; reader mode just swaps
        // the in-memory readerHead. BC textarea has no topic split, so
        // peek-restore snapshots the body only.
        const $rail = document.getElementById('bc-preview-rail');
        const self = this;

        const lockReaderSafe = (locked) => {
            // Reader mode already has disabled textarea; skip.
            if (!self.isOwnerMode) return;
            if (self.elements.textarea) self.elements.textarea.readOnly = locked;
        };

        $rail?.addEventListener('mouseover', (e) => {
            const block = e.target.closest('.page-preview-block');
            if (!block) return;
            if (!self._hoverSnapshot &&
                self.isOwnerMode &&
                document.activeElement === self.elements.textarea) return;
            const head = parseInt(block.dataset.head, 10);
            if (Number.isNaN(head) || head < 0) return;
            const rec = self._previewRailCache[head];
            if (!rec) return;
            if (!self._hoverSnapshot) {
                self._hoverSnapshot = { body: self.elements.textarea?.value ?? '' };
                lockReaderSafe(true);
            }
            if (self.elements.textarea) self.elements.textarea.value = rec.text || '';
        });

        $rail?.addEventListener('mouseleave', () => {
            if (!self._hoverSnapshot) return;
            if (self.elements.textarea) self.elements.textarea.value = self._hoverSnapshot.body;
            self._hoverSnapshot = null;
            lockReaderSafe(false);
        });

        // Navigation = shared between desktop click + mobile short-tap.
        const navigateBC = async (head) => {
            if (self._hoverSnapshot) {
                if (self.elements.textarea) self.elements.textarea.value = self._hoverSnapshot.body;
                self._hoverSnapshot = null;
            }
            lockReaderSafe(false);
            clearPeekMarker();
            if (self.isOwnerMode) {
                await self.save(self.elements.textarea?.value ?? '');
                self.state.isVirtual = false;
                self.state.currentHead = head;
                await self.syncOwnerView();
            } else {
                self.readerHead = head;
                self.syncReaderView();
            }
        };

        $rail?.addEventListener('click', async (e) => {
            const block = e.target.closest('.page-preview-block');
            if (!block) return;
            const head = parseInt(block.dataset.head, 10);
            if (Number.isNaN(head) || head < 0) return;
            await navigateBC(head);
        });

        // --- Mobile long-press + touchmove (same shape as BB) -------
        let touchTimer = null;
        let touchStartPos = null;
        let inTouchPeek = false;

        const clearPeekMarker = () => {
            $rail?.querySelectorAll('.peeking').forEach(el => el.classList.remove('peeking'));
        };

        const peekFromPoint = (x, y) => {
            const el = document.elementFromPoint(x, y);
            return el?.closest?.('.page-preview-block') || null;
        };

        const applyPeek = (block) => {
            if (!block) return;
            const head = parseInt(block.dataset.head, 10);
            if (Number.isNaN(head) || head < 0) return;
            const rec = self._previewRailCache[head];
            if (!rec) return;
            clearPeekMarker();
            block.classList.add('peeking');
            if (self.elements.textarea) self.elements.textarea.value = rec.text || '';
        };

        $rail?.addEventListener('touchstart', (e) => {
            const block = e.target.closest('.page-preview-block');
            if (!block) return;
            const touch = e.touches[0];
            const startHead = parseInt(block.dataset.head, 10);
            touchStartPos = { x: touch.clientX, y: touch.clientY, startHead };
            touchTimer = setTimeout(() => {
                touchTimer = null;
                inTouchPeek = true;
                if (self.isOwnerMode && document.activeElement === self.elements.textarea) return;
                self._hoverSnapshot = { body: self.elements.textarea?.value ?? '' };
                lockReaderSafe(true);
                applyPeek(block);
            }, 300);
        }, { passive: true });

        $rail?.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            if (touchTimer && touchStartPos) {
                const dx = touch.clientX - touchStartPos.x;
                const dy = touch.clientY - touchStartPos.y;
                if (dx * dx + dy * dy > 100) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                    return;
                }
            }
            if (!inTouchPeek) return;
            applyPeek(peekFromPoint(touch.clientX, touch.clientY));
        }, { passive: true });

        $rail?.addEventListener('touchend', async (e) => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
                const t = e.changedTouches[0];
                const block = peekFromPoint(t.clientX, t.clientY);
                if (block) {
                    const head = parseInt(block.dataset.head, 10);
                    if (!Number.isNaN(head) && head >= 0) {
                        e.preventDefault();
                        await navigateBC(head);
                    }
                }
                touchStartPos = null;
                return;
            }
            if (inTouchPeek) {
                inTouchPeek = false;
                // Drag-and-drop swap (Tier 22, owner mode only).
                const endTouch = e.changedTouches[0];
                const endBlock = peekFromPoint(endTouch.clientX, endTouch.clientY);
                const endHead = endBlock ? parseInt(endBlock.dataset.head, 10) : -1;
                const startHead = touchStartPos?.startHead ?? -1;

                if (self._hoverSnapshot) {
                    if (self.elements.textarea) self.elements.textarea.value = self._hoverSnapshot.body;
                    self._hoverSnapshot = null;
                }
                lockReaderSafe(false);
                clearPeekMarker();

                if (self.isOwnerMode && startHead >= 0 && endHead >= 0 && startHead !== endHead) {
                    try {
                        const newHead = await BCDb.swapRecordsByHead(self.state.localChannelId, startHead, endHead);
                        if (newHead >= 0) self.state.currentHead = newHead;
                        await self.syncOwnerView();
                        CrossTabSync.broadcast('bc:record:mutated', {
                            localChannelId: self.state.localChannelId,
                            timestamp: null
                        });
                    } catch (err) {
                        console.error('BC touch reorder failed:', err);
                    }
                }
            }
            touchStartPos = null;
        });

        // HTML5 drag-and-drop on the rail (desktop). Owner-only.
        $rail?.addEventListener('dragstart', (e) => {
            if (!self.isOwnerMode) return;
            const block = e.target.closest?.('.page-preview-block');
            if (!block) return;
            const head = parseInt(block.dataset.head, 10);
            if (Number.isNaN(head) || head < 0) return;
            e.dataTransfer.setData('text/plain', String(head));
            e.dataTransfer.effectAllowed = 'move';
            block.classList.add('dragging');
        });

        $rail?.addEventListener('dragend', (e) => {
            const block = e.target.closest?.('.page-preview-block');
            if (block) block.classList.remove('dragging');
        });

        $rail?.addEventListener('dragover', (e) => {
            if (!self.isOwnerMode) return;
            if (e.target.closest?.('.page-preview-block')) e.preventDefault();
        });

        $rail?.addEventListener('drop', async (e) => {
            e.preventDefault();
            if (!self.isOwnerMode) return;
            const block = e.target.closest?.('.page-preview-block');
            if (!block) return;
            const fromHead = parseInt(e.dataTransfer.getData('text/plain'), 10);
            const toHead = parseInt(block.dataset.head, 10);
            if (Number.isNaN(fromHead) || Number.isNaN(toHead)) return;
            if (fromHead < 0 || toHead < 0 || fromHead === toHead) return;
            try {
                const newHead = await BCDb.swapRecordsByHead(self.state.localChannelId, fromHead, toHead);
                if (newHead >= 0) self.state.currentHead = newHead;
                await self.syncOwnerView();
                CrossTabSync.broadcast('bc:record:mutated', {
                    localChannelId: self.state.localChannelId,
                    timestamp: null
                });
            } catch (err) {
                console.error('BC drag reorder failed:', err);
            }
        });

        $rail?.addEventListener('touchcancel', () => {
            if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
            if (inTouchPeek) {
                inTouchPeek = false;
                if (self._hoverSnapshot) {
                    if (self.elements.textarea) self.elements.textarea.value = self._hoverSnapshot.body;
                    self._hoverSnapshot = null;
                }
                lockReaderSafe(false);
                clearPeekMarker();
            }
            touchStartPos = null;
        });
    },

    // =====================================================================
    //  Load Channel
    // =====================================================================

    async loadChannel(channel) {
        this.timers.cancelAll();
        // Unsubscribe from previous channel before switching
        if (this.currentChannel?.serverChannelId !== channel.serverChannelId) {
            this._unsubscribeFromChannel(this.currentChannel?.serverChannelId);
        }
        playAudio('UIGeneralFocus.mp3');
        this.currentChannel = channel;

        const me = localStorage.getItem('currentUser');
        const hasTitle = !!localStorage.getItem('currentTitle');
        const isOwner = !!(me && hasTitle && channel.ownerUid === me);

        // Owner on this device but no local copy (cross-device / after WIPE
        // LOCAL). Pull the server copy into IndexedDB so owner mode can work
        // — otherwise `channel.isLocal` stays false and owner would be locked
        // into reader mode on their own channel.
        if (isOwner && !channel.isLocal && channel.serverChannelId) {
            try {
                await this._bootstrapLocalFromServer(channel);
                window.dispatchEvent(new CustomEvent('broadcast:localBootstrapped', {
                    detail: { serverChannelId: channel.serverChannelId }
                }));
            } catch (e) {
                console.error('BC: bootstrap failed', e);
                BBMessage.error(t('broadcast.fetchFailed'));
                // channel.isLocal stays false → falls through to reader mode
            }
        }

        this.isOwnerMode = !!(isOwner && channel.isLocal);

        // Lock the chip UI for readers. Without this, the attachment instance
        // (init'd with readOnly: false to support owner mode) renders the
        // remove button and editable name input on every chip — reader clicks
        // would remove chips from the DOM while the onDetach/onRename guards
        // silently skip the DB write, causing UI/record desync until re-render.
        this.bcAttach?.setReadOnly(!this.isOwnerMode);

        // DELETE PAGE is owner-only; hide for readers so the button itself
        // isn't a confusing no-op target.
        const $bcDel = document.getElementById('bc-delete-page-btn');
        if ($bcDel) $bcDel.style.display = this.isOwnerMode ? '' : 'none';

        if (this.isOwnerMode) {
            await this.loadOwnerMode(channel);
        } else {
            await this.loadReaderMode(channel);
        }

        // Subscribe for live updates (works for both owner and reader)
        this._subscribeToChannel(channel.serverChannelId);
    },

    /**
     * Fetch server records for a channel the current user owns and build local
     * metadata + records for it. Mutates `channel` in place so the rest of
     * loadChannel sees `localId` (real positive id) and `isLocal: true`.
     *
     * Called only when the owner has no local copy (cross-device / WIPE LOCAL).
     * Idempotent via BCMeta.bootstrapFromServer.
     */
    async _bootstrapLocalFromServer(channel) {
        const data = await BroadcastService.fetchBoards(channel.serverChannelId);
        const records = data?.records ?? [];

        const localId = await BCMeta.bootstrapFromServer({
            id: channel.serverChannelId,
            name: channel.name,
            owner_uid: channel.ownerUid,
            owner_title: localStorage.getItem('currentTitle') || '',
            last_signal: channel.lastSignal
        }, records);

        channel.localId = localId;
        channel.isLocal = true;
        channel.isLocalOnly = false;
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
        if (cached && Date.now() - cached.fetchedAt < T('frontend.frontendCache.bcReaderCacheTTL')) {
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

        const entryBefore = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);
        await BCDb.cleanupOldRecords(this.state.localChannelId, BOARD_MAX_SLOT);

        const count = await BCDb.countRecords(this.state.localChannelId);
        if (count === 0) {
            this.state.currentHead = 0;
            this.state.isVirtual = true;
            await this.syncOwnerView();
            return;
        }
        if (this.state.currentHead >= count) {
            this.state.currentHead = count - 1;
            await this.syncOwnerView();
            return;
        }
        const entryAfter = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);
        if (!entryBefore || !entryAfter || entryBefore.timestamp !== entryAfter.timestamp) {
            await this.syncOwnerView();
            return;
        }

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
                await this.save(text);
            }
            this.state.isVirtual = false;
            await this.syncOwnerView();
            return;
        }

        const entryBefore = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);
        await BCDb.cleanupOldRecords(this.state.localChannelId, BOARD_MAX_SLOT);

        const count = await BCDb.countRecords(this.state.localChannelId);

        // Post-scrub revalidation (three defenses from BB).
        if (count === 0) {
            this.state.currentHead = 0;
            this.state.isVirtual = true;
            await this.syncOwnerView();
            return;
        }
        if (this.state.currentHead >= count) {
            this.state.currentHead = count - 1;
            await this.syncOwnerView();
            return;
        }
        const entryAfter = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);
        if (!entryBefore || !entryAfter || entryBefore.timestamp !== entryAfter.timestamp) {
            await this.syncOwnerView();
            return;
        }

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
                // Tier 18: always in-place edit (no rebase).
                if (entry.text !== text) {
                    await BCDb.updateTextInPlace(this.state.localChannelId, entry.timestamp, text);
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
            this.state.currentFileHash = null;
            this.updateIndicators(t('broadcast.headNew'));
            await this.renderPreviewRail();
            return;
        }

        try {
            const entry = await BCDb.getRecord(this.state.localChannelId, this.state.currentHead);
            if (this.elements.textarea) {
                this.elements.textarea.value = entry?.text ?? '';
            }

            // Sync attachment chip
            const bin = entry?.file_hash ?? null;
            this.state.currentFileHash = bin;
            const hash = (typeof bin === 'object') ? bin?.hash : bin;
            this.bcAttach?.setFromRecord(hash || null, typeof bin === 'object' ? bin : null);

            this.updateIndicators();
            await this.renderPreviewRail();
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
        const bin = record?.file_hash ?? null;
        this.state.currentFileHash = bin;
        const hash = typeof bin === 'object' ? bin?.hash : bin;
        this.bcAttach?.setFromRecord(hash || null, typeof bin === 'object' ? bin : null);

        this.updateIndicators(this.readerHead);
        this.renderPreviewRail();
    },

    // =====================================================================
    //  Page Previewer rail (Tier 11 part 2 — BC)
    // =====================================================================

    // Owner mode reads records from IDB; reader mode reads from the
    // in-memory serverRecords[] array. Either way, head 0 = newest (top
    // of rail). BC has no topic, so blocks only show the body's first
    // line as a tooltip — not a split topic+body reveal like BB.
    _previewRailCache: [],
    _hoverSnapshot: null,

    async renderPreviewRail() {
        const rail = document.getElementById('bc-preview-rail');
        if (!rail) return;

        let records;
        if (this.isOwnerMode && this.state.localChannelId) {
            records = await BCDb.getAllRecords(this.state.localChannelId);
        } else {
            records = this.serverRecords || [];
        }
        this._previewRailCache = records;

        const activeHead = this.isOwnerMode ? this.state.currentHead : this.readerHead;
        const isVirtual = this.isOwnerMode && this.state.isVirtual;

        const frag = document.createDocumentFragment();

        if (isVirtual) {
            const vBlock = document.createElement('div');
            vBlock.className = 'page-preview-block virtual active';
            vBlock.dataset.head = '-1';
            frag.appendChild(vBlock);
        }

        records.forEach((rec, idx) => {
            const block = document.createElement('div');
            let cls = 'page-preview-block';
            if (!isVirtual && idx === activeHead) cls += ' active';
            block.className = cls;
            block.dataset.head = String(idx);
            if (this.isOwnerMode) block.draggable = true;  // Tier 22 reorder; readers can't mutate
            frag.appendChild(block);
        });

        rail.replaceChildren(frag);
    },

    // =====================================================================
    //  Indicators + Lock
    // =====================================================================

    updateIndicators(headOverride) {
        if (!this.currentChannel) return;

        // Guard: only write shared indicators when a BC page is active
        const activePage = document.querySelector('.page.active');
        if (!activePage || !activePage.dataset.page?.startsWith('broadcast-')) return;

        const name = this.currentChannel.name || t('broadcast.headFallback');
        if ($branchName) {
            // Head-indicator: channel name only. Subscription status
            // lives on the BC list (bookmark icon in the row's status
            // stack, Tier 22), not inside the indicator.
            $branchName.textContent = name;
            $branchName.style.flexDirection = '';
        }

        const head = headOverride !== undefined
            ? headOverride
            : (this.isOwnerMode ? this.state.currentHead : this.readerHead);
        if ($branchHead) $branchHead.textContent = head;

        // Reader/subscriber mode has no outgoing-dirty concept, so the
        // .branch-is-saved slot stays empty — the indicator reads as
        // ":channel_name:head". Owner mode keeps the DRAFT / POSTED label.
        if ($savedStatus) {
            if (this.isOwnerMode) {
                $savedStatus.textContent = this.currentChannel.serverChannelId ? t('broadcast.statusCast') : t('broadcast.statusLocal');
            } else {
                $savedStatus.textContent = '';
            }
        }
    },

    clearIndicators() {
        // Guard: only clear shared indicators when a BC page is active
        const activePage = document.querySelector('.page.active');
        if (!activePage || !activePage.dataset.page?.startsWith('broadcast-')) return;

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

// DELETE PAGE — destructive 3-step. Owner mode only; reader can't
// mutate server records. Button is always wired but guards no-op in
// reader mode + virtual state.
const $bcDeleteBtn = document.getElementById('bc-delete-page-btn');
if ($bcDeleteBtn) {
    new MultiStepButton($bcDeleteBtn, {
        sound: "Click.mp3",
        steps: 3,
        action: async () => {
            const activePage = document.querySelector('.page.active');
            if (activePage?.dataset?.page !== 'broadcast-channel') return;
            if (!BCChannel.isOwnerMode) {
                BBMessage.error(t('broadcast.notOwner'));
                return;
            }
            if (BCChannel.state.isVirtual) {
                BBMessage.info(t('common.deletePageFailed'));
                return;
            }
            try {
                const entry = await BCDb.getRecord(BCChannel.state.localChannelId, BCChannel.state.currentHead);
                if (!entry) return;
                await db.broadcast_boards.delete([entry.local_channel_id, entry.timestamp]);
                const count = await BCDb.countRecords(BCChannel.state.localChannelId);
                if (count === 0) {
                    BCChannel.state.isVirtual = true;
                    BCChannel.state.currentHead = 0;
                } else if (BCChannel.state.currentHead >= count) {
                    BCChannel.state.currentHead = count - 1;
                }
                await BCChannel.syncOwnerView();
                CrossTabSync.broadcast('bc:record:mutated', {
                    localChannelId: BCChannel.state.localChannelId,
                    timestamp: null
                });
                BBMessage.info(t('common.pageDeleted'));
            } catch (err) {
                console.error('BC delete page failed:', err);
                BBMessage.error(t('common.deletePageFailed'));
            }
        }
    });
}
