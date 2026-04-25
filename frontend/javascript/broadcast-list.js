/**
 * Broadcast List - Channel List Controller
 * =================================================================
 * Responsibilities:
 * 1. Render combined channel list (local-only + server public channels).
 * 2. InfiniteList cursor (same mechanics as WT list).
 * 3. PIN  button: toggle pin for selected channel (server for logged-in, none otherwise).
 * 4. CAST button: upload local channel to server (title required).
 * 5. CREATE button: create blank local channel with timestamp name (title required).
 * 6. DELETE button: delete selected channel (title + ownership required).
 * 7. 500ms debounce on cursor change before dispatching broadcast:selected.
 * 8. Channel name rename → refresh navi <--->.
 * 9. Each refresh: cursor at index 0.
 * =================================================================
 * Design: Uses WT list philosophy (InfiniteList, MultiStepButton, BBMessage).
 *         Channel list item: 3 rows — name input, last_signal, title (owner's title).
 *         Sort: pinned > non-pinned, within group by last_signal DESC.
 * =================================================================
 * Dependencies: BroadcastService, BCDb, BCMeta, InfiniteList, MultiStepButton, BBMessage
 * =================================================================
 */

import { BroadcastService } from './services/broadcast-service.js';
import { FileService } from './services/file-service.js';
import { BCDb, BCMeta, getHKTTimestamp, _parseJsonbColumn } from './broadcast-db.js';
import { InfiniteList } from './blackboard-ui-list.js';
import { MultiStepButton } from './multiStepButton.js';
import { BBMessage } from './blackboard-msg.js';
import { playAudio } from './audio.js';
import { t } from './i18n.js';
import { T } from './timing.js';
import { updateNaviPosition } from './navi.js';
import { makeStatusLegend } from './list-status.js';
import db from './indexedDB.js';

// Sub-navi <---> text element — updated when channel is selected or renamed
const $bcNaviText = document.querySelector(
    '.sub-navi-item[data-sub-navi-item="broadcast-channel"] .sub-navi-item-text'
);

export const BCList = {
    elements: {
        container: document.querySelector('.broadcast-list-list-container'),
        pinBtn: document.getElementById('broadcast-pin-btn'),
        castBtn: document.getElementById('broadcast-cast-btn'),
        createBtn: document.getElementById('broadcast-create-btn'),
        deleteBtn: document.getElementById('broadcast-delete-btn'),
    },

    channels: [],          // Merged list: { localId, serverChannelId, name, lastSignal, ownerTitle, ownerUid, isPinned, isLocal } (JS vars stay camelCase)
    infiniteList: null,
    selectionTimer: null,
    selectedChannel: null,
    _fetchController: null,

    init() {
        this.bindEvents();
        this.updateActionButtonsVisibility();
    },

    // =====================================================================
    //  Permission helpers
    // =====================================================================

    hasTitle() {
        return !!localStorage.getItem('currentTitle');
    },

    isOwnerOf(channel) {
        const me = localStorage.getItem('currentUser');
        return me && channel && channel.ownerUid === me;
    },

    /**
     * Title to display on the channel row (row 3).
     * Prefer the stored owner_title (from server or local create snapshot).
     * For my-own channels without a stored title (legacy rows), fall back to
     * my current title. Last resort: owner uid, then the common head marker.
     */
    resolveOwnerTitle(channel) {
        if (channel.ownerTitle) return channel.ownerTitle;
        const me = localStorage.getItem('currentUser');
        if (channel.ownerUid && channel.ownerUid === me) {
            return localStorage.getItem('currentTitle') || channel.ownerUid;
        }
        return channel.ownerUid || t('common.head');
    },

    /**
     * Action buttons visibility:
     *   CREATE — any titled user (no selection needed)
     *   CAST   — titled AND owner of currently-selected channel
     *   DELETE — same as CAST
     *
     * If nothing is selected, or the selected channel was cast by
     * someone else, CAST/DELETE hide entirely. Without this, a
     * titled user looking at someone else's channel saw the
     * buttons and would only learn it was forbidden after clicking
     * (server enforces but the UI shouldn't dangle the option).
     */
    updateActionButtonsVisibility() {
        const titled = this.hasTitle();
        const isOwnerOfSelected = this.selectedChannel && this.isOwnerOf(this.selectedChannel);
        const showOwnerActions = titled && !!isOwnerOfSelected;

        if (this.elements.createBtn) {
            this.elements.createBtn.style.display = titled ? '' : 'none';
        }
        if (this.elements.castBtn) {
            this.elements.castBtn.style.display = showOwnerActions ? '' : 'none';
        }
        if (this.elements.deleteBtn) {
            this.elements.deleteBtn.style.display = showOwnerActions ? '' : 'none';
        }
    },

    // =====================================================================
    //  Events
    // =====================================================================

    bindEvents() {
        // Auth change → refresh list + re-evaluate button visibility
        window.addEventListener('auth:updated', () => {
            this.updateActionButtonsVisibility();
            this.selectedChannel = null; // Force selection reset — owner mode needs recalculation
            this.fetchAndRender();
        });

        // BCChannel.loadChannel just bootstrapped local metadata for a
        // previously server-only channel. Re-merge so the row flips from
        // a pseudo (localId = -serverId, isLocal: false) entry to the real
        // local one, and selectedChannel will resolve to the new object
        // via the render()'s selectedLocalId lookup.
        window.addEventListener('broadcast:localBootstrapped', () => {
            this.fetchAndRender();
        });

        // Window focus → re-fetch public channels (only when BC page active)
        window.addEventListener('focus', () => {
            const activePage = document.querySelector('.page.active');
            const isBCActive = activePage && activePage.dataset.page && activePage.dataset.page.startsWith('broadcast-');
            if (isBCActive) {
                this.fetchAndRender();
            }
        });

        // InfiniteList cursor → 500ms debounce → dispatch broadcast:selected
        window.addEventListener('list:selectionChanged', (e) => {
            const { item } = e.detail;
            if (!item || !this.elements.container?.contains(item)) return;

            const localId = parseInt(item.dataset.localId);
            const ch = this.channels.find(c => c.localId === localId);
            if (!ch) return;

            this.selectedChannel = ch;
            this.updatePinBtnText();
            this.updateActionButtonsVisibility();

            clearTimeout(this.selectionTimer);
            this.selectionTimer = setTimeout(() => {
                this.updateNaviText(ch.name);
                window.dispatchEvent(new CustomEvent('broadcast:selected', { detail: ch }));
            }, T('frontend.ui.listSelectionDebounce'));
        });

        // Channel renamed → update navi + server if cast
        window.addEventListener('broadcast:channelRenamed', (e) => {
            const { localId, newName, serverChannelId } = e.detail;
            const ch = this.channels.find(c => c.localId === localId);
            if (ch) ch.name = newName;
            if (this.selectedChannel?.localId === localId) {
                this.selectedChannel.name = newName;
                this.updateNaviText(newName);
            }
        });

        // WS-driven last_signal refresh — no network call
        window.addEventListener('broadcast:signalUpdated', (e) => {
            const { serverChannelId, lastSignal } = e.detail;
            const ch = this.channels.find(c => c.serverChannelId === serverChannelId);
            if (!ch) return;
            ch.lastSignal = lastSignal;
            this.sortChannels();
            this.render();
        });

        // Tier 22.9: owner mutated content in BCChannel (same tab) — flip
        // the row's isDirty flag and re-render so the cloud icon swaps
        // to cloud-with-cross without a full network fetch.
        window.addEventListener('broadcast:localDirty', (e) => {
            const localId = e.detail?.localId;
            if (!localId) return;
            const ch = this.channels.find(c => c.localId === localId);
            if (!ch) return;
            ch.isDirty = true;
            this.render();
        });

        // Tier 18: loopList setting removed — InfiniteList.loop always false.

        // --- PIN ---
        if (this.elements.pinBtn) {
            this.elements.pinBtn.addEventListener('click', async () => {
                if (!this.selectedChannel) {
                    playAudio('UIGeneralCancel.mp3');
                    return BBMessage.error(t('broadcast.noTarget'));
                }

                const ch = this.selectedChannel;
                const isLoggedIn = !!localStorage.getItem('currentUser');

                if (!isLoggedIn) {
                    playAudio('UIGeneralCancel.mp3');
                    return BBMessage.error(t('broadcast.loginRequired'));
                }
                if (!ch.serverChannelId) {
                    // Local-only (uncast) channel — no server row to pin against.
                    playAudio('UIGeneralCancel.mp3');
                    return BBMessage.error(t('broadcast.pinRequiresCast'));
                }

                try {
                    if (ch.isPinned) {
                        playAudio('UISelectOff.mp3');
                        await BroadcastService.unpin(ch.serverChannelId);
                        ch.isPinned = false;
                        BBMessage.success(t('broadcast.unpinned'));
                    } else {
                        playAudio('UISelectOn.mp3');
                        await BroadcastService.pin(ch.serverChannelId);
                        ch.isPinned = true;
                        BBMessage.success(t('broadcast.pinned'));
                    }
                    // Re-sort and re-render to reflect new pin state
                    this.updatePinBtnText();
                    this.sortChannels();
                    this.render();
                } catch (e) {
                    console.error('PIN ERROR:', e);
                    // Mirror the 4xx-passthrough pattern used by CAST /
                    // DELETE / rename: let the backend's human-readable
                    // message reach the user when the failure is on their
                    // side, fall back to the generic toast on 5xx/network.
                    const isUserError = e.status >= 400 && e.status < 500;
                    BBMessage.error(isUserError ? (e.message || t('broadcast.pinFailed')) : t('broadcast.pinFailed'));
                }
            });
        }

        // --- CAST ---
        if (this.elements.castBtn) {
            new MultiStepButton(this.elements.castBtn, {
                sound: 'UIPipboyOK.mp3',
                steps: 1,
                action: async () => {
                    if (!this.hasTitle()) return BBMessage.error(t('broadcast.titleRequired'));
                    if (!this.selectedChannel) return BBMessage.error(t('broadcast.noTarget'));
                    if (!this.isOwnerOf(this.selectedChannel)) return BBMessage.error(t('broadcast.notOwner'));

                    const ch = this.selectedChannel;
                    const msg = BBMessage.loading(t('broadcast.casting'));

                    try {
                        // Gather local board records
                        const localRecords = await BCDb.getAllRecords(ch.localId);
                        const candidateRecords = localRecords.filter(r =>
                            (r.text && r.text.trim()) || r.file_hash
                        );

                        // Local First: upload pending files but never strip the hash.
                        // Failed uploads stay 'local' in file_blobs; next cast retries.
                        let failedCount = 0;
                        const apiRecords = [];
                        for (const r of candidateRecords) {
                            let hashStr = null;

                            if (r.file_hash) {
                                const hash = (typeof r.file_hash === 'object') ? r.file_hash.hash : r.file_hash;
                                const fileName = (typeof r.file_hash === 'object' && r.file_hash.name) || hash.substring(0, 8);
                                hashStr = hash;

                                const localFile = await db.file_blobs.get(hash);
                                if (localFile && localFile.blob) {
                                    if (localFile.status !== 'synced') {
                                        const toast = BBMessage.loading(t('broadcast.uploading', { name: fileName }));
                                        try {
                                            await FileService.upload(localFile.blob, localFile.name);
                                            await db.file_blobs.update(hash, { status: 'synced' });
                                            toast.update(t('broadcast.uploaded', { name: fileName }));
                                        } catch (err) {
                                            console.error(`BC Cast: Upload failed for ${hash}`, err);
                                            toast.close();
                                            BBMessage.error(t('broadcast.uploadFailed', { name: fileName }));
                                            failedCount++;
                                        }
                                    }
                                } else {
                                    console.warn(`BC Cast: Local file missing for hash ${hash}`);
                                    failedCount++;
                                }
                            }

                            apiRecords.push({
                                timestamp: r.timestamp,
                                text: r.text || '',
                                file_hash: hashStr
                            });
                        }

                        // Include local calendar + flashcards in cast payload
                        // — bundled with records, same manual-sync cadence as
                        // text + files. Flashcards may be `null` when the
                        // owner has never opened the deck; pass the raw value
                        // through so backend can null it consistently.
                        const localCalendar = await BCMeta.getCalendar(ch.localId);
                        const localFlashcards = await BCMeta.getFlashcards(ch.localId);

                        const result = await BroadcastService.cast({
                            channel_name: ch.name,
                            records: apiRecords,
                            calendar: localCalendar,
                            flashcards: localFlashcards,
                        });

                        const serverCh = result.channel;

                        // Store server ID mapping locally
                        await BCMeta.setServerChannelId(ch.localId, serverCh.id);
                        await BCMeta.updateLastSignal(ch.localId, serverCh.last_signal);
                        // Tier 22.9: cast success clears the dirty flag —
                        // local and server are now byte-for-byte equal. The
                        // list row's icon flips back cloud-with-cross → cloud
                        // on next render.
                        await BCMeta.setDirty(ch.localId, false);

                        ch.serverChannelId = serverCh.id;
                        ch.lastSignal = serverCh.last_signal;
                        ch.isDirty = false;

                        // Honest status: "complete" only when all files uploaded.
                        msg.update(failedCount === 0
                            ? t('broadcast.castComplete')
                            : t('broadcast.castPartial', { count: failedCount }));
                        await this.fetchAndRender();
                    } catch (e) {
                        console.error('CAST ERROR:', e);
                        msg.close();
                        const isUserError = e.status >= 400 && e.status < 500;
                        BBMessage.error(isUserError ? (e.message || t('broadcast.castFailed')) : t('broadcast.castFailed'));
                    }
                }
            });
        }

        // --- CREATE --- (regardless of selected item)
        if (this.elements.createBtn) {
            new MultiStepButton(this.elements.createBtn, {
                sound: 'UIPipboyOKPress.mp3',
                action: async () => {
                    if (!this.hasTitle()) return BBMessage.error(t('broadcast.titleRequired'));

                    const autoName = `BC_${Date.now()}`;
                    const msg = BBMessage.loading(t('broadcast.creating'));

                    let localId;
                    try {
                        localId = await BCMeta.createChannel(autoName);
                        // Create initial empty board record
                        await BCDb.addRecord(localId, '');

                        msg.update(t('broadcast.createComplete'));
                        await this.fetchAndRender();

                        // Auto-select the new channel (it will be at top after sort).
                        // fetchAndRender's internal render() already ran against the
                        // OLD selectedChannel, so the `.active` class + InfiniteList
                        // cursor still sit on the previously-selected row. Re-render
                        // after updating selectedChannel so the cursor follows the
                        // auto-selection — otherwise PIN/CAST/DELETE read newCh while
                        // the user visually points at the previous row.
                        const newCh = this.channels.find(c => c.localId === localId);
                        if (newCh) {
                            this.selectedChannel = newCh;
                            this.render();
                            this.updateActionButtonsVisibility();
                            this.updateNaviText(newCh.name);
                            window.dispatchEvent(new CustomEvent('broadcast:selected', { detail: newCh }));
                        }
                    } catch (e) {
                        console.error('CREATE ERROR:', e);
                        // If createChannel succeeded but addRecord failed, clean up the
                        // orphaned channel entry so it doesn't linger in the list.
                        if (localId != null) {
                            await BCMeta.deleteChannel(localId).catch(() => {});
                        }
                        msg.close();
                        BBMessage.error(t('broadcast.createFailed'));
                    }
                }
            });
        }

        // --- DELETE ---
        if (this.elements.deleteBtn) {
            new MultiStepButton(this.elements.deleteBtn, {
                sound: 'UIGeneralCancel.mp3',
                steps: 1,
                action: async () => {
                    if (!this.hasTitle()) return BBMessage.error(t('broadcast.titleRequired'));
                    if (!this.selectedChannel) return BBMessage.error(t('broadcast.noTarget'));
                    if (!this.isOwnerOf(this.selectedChannel)) return BBMessage.error(t('broadcast.notOwner'));

                    const ch = this.selectedChannel;
                    const msg = BBMessage.loading(t('broadcast.deleting'));

                    try {
                        // Delete from server if cast
                        if (ch.serverChannelId) {
                            await BroadcastService.destroy(ch.serverChannelId);
                        }
                        // Delete local data
                        await BCMeta.deleteChannel(ch.localId);

                        this.selectedChannel = null;
                        this.updateActionButtonsVisibility();
                        this.updateNaviText('');

                        msg.update(t('broadcast.deleteComplete'));
                        window.dispatchEvent(new CustomEvent('broadcast:cleared'));
                        await this.fetchAndRender();
                    } catch (e) {
                        console.error('DELETE ERROR:', e);
                        msg.close();
                        const isUserError = e.status >= 400 && e.status < 500;
                        BBMessage.error(isUserError ? (e.message || t('broadcast.deleteFailed')) : t('broadcast.deleteFailed'));
                    }
                }
            });
        }
    },

    // =====================================================================
    //  Data Loading
    // =====================================================================

    async fetchAndRender() {
        // [Focus Protection]: Skip update if user is currently renaming a channel
        const isTyping = document.activeElement && document.activeElement.classList.contains('broadcast-list-tag');
        if (isTyping) return;

        // Abort any in-flight request before starting a new one
        this._fetchController?.abort();
        this._fetchController = new AbortController();
        const { signal } = this._fetchController;

        try {
            // 1. Fetch server public channels
            const data = await BroadcastService.listChannels(signal);
            if (signal.aborted) return;
            const serverChannels = data?.channels ?? [];

            // 2. Fetch local channel metadata from IndexedDB
            const localMetas = await BCMeta.getAllChannels();

            // Build merged list — avoid duplicates between local and server
            const merged = new Map(); // key: localId

            // Add local channels first
            for (const meta of localMetas) {
                merged.set(meta.local_id, {
                    localId: meta.local_id,
                    serverChannelId: meta.server_channel_id ?? null,
                    name: meta.name,
                    lastSignal: meta.last_signal ?? 0,
                    ownerUid: meta.owner_uid ?? '',
                    ownerTitle: meta.owner_title ?? '',
                    isPinned: false,
                    isLocal: true,
                    isLocalOnly: !meta.server_channel_id,
                    // Tier 22.9: dirty = owner has local content that hasn't
                    // been cast yet on an already-cast channel. Drives the
                    // cloud → cloud-with-cross icon on the list row.
                    isDirty: !!meta.isDirty,
                });
            }

            // Overlay / add server channels
            for (const sch of serverChannels) {
                // Check if we have a local record for this server channel
                let found = null;
                for (const [lid, ch] of merged) {
                    if (ch.serverChannelId === sch.id) {
                        found = ch;
                        break;
                    }
                }

                if (found) {
                    // Update with fresh server data
                    found.name = sch.name;
                    found.lastSignal = sch.last_signal;
                    found.ownerUid = sch.owner_uid;
                    found.ownerTitle = sch.owner_title ?? '';
                    found.isPinned = sch.is_pinned ?? false;
                    found.isLocalOnly = false;
                    // Tier 9e — pipe server JSONB blobs (calendar +
                    // flashcards) onto the merged channel. DB facade
                    // returns these as raw JSON strings; `_parseJsonbColumn`
                    // decodes to real objects. Feature modules
                    // (features/calendar.js, features/flashcard.js) read
                    // these through `BCChannel.currentChannel`.
                    // For owner-local rows we PREFER server (matches
                    // LWW semantics — the last cast wins across devices),
                    // but guard with a null check so the existing
                    // subscriber-path and uncast rows still work.
                    found.calendar = _parseJsonbColumn(sch.calendar, null);
                    found.flashcards = _parseJsonbColumn(sch.flashcards, null);
                    found.whitelistId = sch.whitelist_id ?? null;
                } else {
                    // Server-only channel (not owned locally)
                    const pseudoLocalId = -(sch.id); // negative to avoid collision with Dexie auto-increment
                    merged.set(pseudoLocalId, {
                        localId: pseudoLocalId,
                        serverChannelId: sch.id,
                        name: sch.name,
                        lastSignal: sch.last_signal,
                        ownerUid: sch.owner_uid,
                        ownerTitle: sch.owner_title ?? '',
                        isPinned: sch.is_pinned ?? false,
                        isLocal: false,
                        isLocalOnly: false,
                        calendar: _parseJsonbColumn(sch.calendar, null),
                        flashcards: _parseJsonbColumn(sch.flashcards, null),
                        whitelistId: sch.whitelist_id ?? null,
                    });
                }
            }

            this.channels = Array.from(merged.values());
            this.sortChannels();
            // If the previously-selected channel no longer exists in
            // the new list (deleted on server, wiped, signed-out
            // user's view doesn't include it, etc.), drop the stale
            // reference so CAST/DELETE visibility recalculates correctly.
            if (this.selectedChannel && !this.channels.some(c => c.localId === this.selectedChannel.localId)) {
                this.selectedChannel = null;
            }
            this.render();
            this.updateActionButtonsVisibility();
        } catch (e) {
            if (signal.aborted || e.name === 'AbortError') return; // silent cancel
            console.error('BCList: Fetch failed', e);
            BBMessage.error(t('broadcast.syncFailed'));
        }
    },

    sortChannels() {
        this.channels.sort((a, b) => {
            // Pinned first
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
            // Within same group: last_signal DESC
            return b.lastSignal - a.lastSignal;
        });
    },

    // =====================================================================
    //  Rendering
    // =====================================================================

    render() {
        if (!this.elements.container) return;

        // Preserve current selection so InfiniteList.refresh() finds .active
        const selectedLocalId = this.selectedChannel?.localId ?? null;

        this.elements.container.innerHTML = '';

        this.channels.forEach(ch => {
            const item = document.createElement('div');
            item.classList.add('broadcast-list-list-item');
            if (selectedLocalId !== null && ch.localId === selectedLocalId) {
                item.classList.add('active');
            }
            item.dataset.localId = ch.localId;

            // Row 1: channel name (editable input)
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.classList.add('broadcast-list-tag');
            nameInput.placeholder = t('broadcast.channelNamePlaceholder');
            nameInput.name = 'broadcast-list-tag';
            nameInput.value = ch.name;
            // Non-owners can't rename — disable the input at the HTML level
            // (dim opacity + no caret via CSS) instead of letting them focus,
            // see a blinking cursor and type into a toast-bouncing dead-end.
            // Matches BC channel textarea (disabled in reader mode) and the
            // WT THEY textarea — no caret when the user can't actually edit.
            if (!this.isOwnerOf(ch)) {
                nameInput.disabled = true;
            }

            nameInput.addEventListener('change', async (e) => {
                const newName = e.target.value.trim();
                if (!newName) {
                    e.target.value = ch.name;
                    return BBMessage.error(t('broadcast.nameEmpty'));
                }
                if (!this.isOwnerOf(ch)) {
                    e.target.value = ch.name;
                    return BBMessage.error(t('broadcast.notOwner'));
                }

                try {
                    // Update local metadata
                    await BCMeta.renameChannel(ch.localId, newName);

                    // If cast: update server
                    if (ch.serverChannelId) {
                        await BroadcastService.rename(ch.serverChannelId, { name: newName });
                    }

                    window.dispatchEvent(new CustomEvent('broadcast:channelRenamed', {
                        detail: { localId: ch.localId, newName, serverChannelId: ch.serverChannelId }
                    }));
                } catch (err) {
                    console.error('RENAME ERROR:', err);
                    e.target.value = ch.name;
                    const isUserError = err.status >= 400 && err.status < 500;
                    BBMessage.error(isUserError ? (err.message || t('broadcast.renameFailed')) : t('broadcast.renameFailed'));
                }
            });

            // Prevent InfiniteList from swallowing input events
            nameInput.addEventListener('click', e => e.stopPropagation());
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
                e.stopPropagation();
            });

            // Row 2: last signal timestamp
            const lastSignalEl = document.createElement('div');
            lastSignalEl.classList.add('broadcast-list-last-signal');
            lastSignalEl.textContent = ch.lastSignal ? getHKTTimestamp(ch.lastSignal) : t('common.head');

            // Row 3: owner's title + status tags. All tags append as plain
            // text with leading space (single text node), mirroring BB's
            // inline `local [HEAD]` / `[synced]` / `[asynced]` convention:
            //   testTitle [LOCAL]
            //   testTitle [PIN]
            // `pinLabel` locale value already starts with a space.
            const titleEl = document.createElement('div');
            titleEl.classList.add('broadcast-list-title');
            titleEl.textContent = this.resolveOwnerTitle(ch);
            if (ch.isLocalOnly) {
                titleEl.textContent += ` [${t('broadcast.statusLocal')}]`;
            }
            if (ch.isPinned) {
                titleEl.textContent += t('broadcast.pinLabel');
            }

            // Tier 22.8: BC has exactly TWO icon slots — cloud (synced)
            // and cloud-with-cross (asynced). No HEAD eye, no LOCAL
            // floppy. `isLocalOnly` drafts show no icon (panel disappears).
            //   SYNCED  → channel is cast AND in sync with server
            //   ASYNCED → channel is cast but owner has unpushed local
            //             changes (subscribers never see cross — they
            //             can't mutate server content so "divergence"
            //             would be meaningless for them)
            const isCast = !!(ch.serverChannelId && !ch.isLocalOnly);
            // `locked` fires whenever the server row has a whitelist
            // attached. It's purely a visibility affordance for the
            // viewer — they're ALREADY able to see the row (the server
            // filtered out rows they can't access), the lock icon just
            // signals "this is a restricted channel, not public". Owners
            // see it on their own private channels too so they remember
            // which presets are applied where.
            const iconsWrap = makeStatusLegend({
                synced:  isCast && !(this.isOwnerOf(ch) && ch.isDirty),
                asynced: isCast &&  (this.isOwnerOf(ch) && ch.isDirty),
                locked:  isCast && !!ch.whitelistId,
                pinned:  !!ch.isPinned,
            });

            item.appendChild(nameInput);
            item.appendChild(lastSignalEl);
            item.appendChild(titleEl);
            item.appendChild(iconsWrap);
            this.elements.container.appendChild(item);
        });

        // Initialize or refresh InfiniteList — always position cursor at index 0.
        // Tier 18: no loop.
        if (this.infiniteList) {
            this.infiniteList.refresh();
        } else if (this.channels.length > 0) {
            this.infiniteList = new InfiniteList(
                this.elements.container,
                '.broadcast-list-list-item'
            );
        }
    },

    // =====================================================================
    //  Navi
    // =====================================================================

    updatePinBtnText() {
        if (!this.elements.pinBtn) return;
        this.elements.pinBtn.textContent = this.selectedChannel?.isPinned ? t('broadcast.unpinBtn') : t('broadcast.pinBtn');
    },

    updateNaviText(name) {
        if ($bcNaviText) {
            $bcNaviText.textContent = name ? name : '<-->';
            // Only reposition if broadcast is currently the active navi item.
            // Calling updateNaviPosition also triggers updatePage(), which would
            // forcibly switch the visible page — wrong when user is on another navi section.
            const $activeNaviItem = document.querySelector('.navi-item.active');
            if ($activeNaviItem && $activeNaviItem.dataset.naviItem === 'broadcast') {
                updateNaviPosition('broadcast', true);
            }
        }
    }
};

// --- Channel Search ---
// Match against the full row content: channel name (input), last-signal
// timestamp, owner title/uid, pin state. User can filter by any word
// they see on the row, not just the channel name.
const $bcSearch = document.getElementById('broadcast-search');
const $bcListContainerEl = document.querySelector('.broadcast-list-list-container');

function applyBcSearch() {
    if (!$bcListContainerEl) return;
    const query = ($bcSearch?.value || '').toLowerCase().trim();
    $bcListContainerEl.querySelectorAll('.broadcast-list-list-item').forEach(item => {
        if (!query) { item.style.display = ''; return; }
        let text = item.innerText.toLowerCase();
        item.querySelectorAll('input, textarea').forEach(el => {
            if (el.value) text += ' ' + el.value.toLowerCase();
        });
        item.style.display = text.includes(query) ? '' : 'none';
    });
    BCList.infiniteList?.refresh();
}

$bcSearch?.addEventListener('input', applyBcSearch);

// Re-apply after any list re-render (fetchAndRender runs on poll / WS /
// cast / create / delete). Rebuilt rows default to display:'' and would
// otherwise drop the user's active filter.
if ($bcListContainerEl) {
    new MutationObserver(() => applyBcSearch())
        .observe($bcListContainerEl, { childList: true });
}

// Init
BCList.init();
BCList.fetchAndRender();
