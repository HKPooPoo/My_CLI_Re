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
import { BCDb, BCMeta, getHKTTimestamp } from './broadcast-db.js';
import { InfiniteList } from './blackboard-ui-list.js';
import { MultiStepButton } from './multiStepButton.js';
import { BBMessage } from './blackboard-msg.js';
import { playAudio } from './audio.js';
import { t } from './i18n.js';
import { T } from './timing.js';
import { updateNaviPosition } from './navi.js';
import * as Settings from './settings.js';
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
        this.lockTitleButtons();
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
     * CAST, CREATE, DELETE only visible for uid with title.
     */
    lockTitleButtons() {
        const show = this.hasTitle();
        if (this.elements.castBtn) this.elements.castBtn.style.display = show ? '' : 'none';
        if (this.elements.createBtn) this.elements.createBtn.style.display = show ? '' : 'none';
        if (this.elements.deleteBtn) this.elements.deleteBtn.style.display = show ? '' : 'none';
    },

    // =====================================================================
    //  Events
    // =====================================================================

    bindEvents() {
        // Auth change → refresh list + re-evaluate button visibility
        window.addEventListener('auth:updated', () => {
            this.lockTitleButtons();
            this.selectedChannel = null; // Force selection reset — owner mode needs recalculation
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

        // Settings: loopList toggle
        window.addEventListener('settings:changed', ({ detail }) => {
            if ((detail.key === 'loopList' && detail.scope === 'bc') || detail.scope === 'all') {
                if (this.infiniteList) this.infiniteList.loop = Settings.get('bc', 'loopList');
            }
        });

        // --- PIN ---
        if (this.elements.pinBtn) {
            this.elements.pinBtn.addEventListener('click', async () => {
                if (!this.selectedChannel) {
                    playAudio('UIGeneralCancel.mp3');
                    return BBMessage.error(t('broadcast.noTarget'));
                }

                const ch = this.selectedChannel;
                const isLoggedIn = !!localStorage.getItem('currentUser');

                if (!isLoggedIn || !ch.serverChannelId) {
                    // Cannot pin local-only or when not logged in
                    playAudio('UIGeneralCancel.mp3');
                    return BBMessage.error(t('broadcast.loginRequired'));
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

                        const result = await BroadcastService.cast({
                            channel_name: ch.name,
                            records: apiRecords
                        });

                        const serverCh = result.channel;

                        // Store server ID mapping locally
                        await BCMeta.setServerChannelId(ch.localId, serverCh.id);
                        await BCMeta.updateLastSignal(ch.localId, serverCh.last_signal);

                        ch.serverChannelId = serverCh.id;
                        ch.lastSignal = serverCh.last_signal;

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

                        // Auto-select the new channel (it will be at top after sort)
                        const newCh = this.channels.find(c => c.localId === localId);
                        if (newCh) {
                            this.selectedChannel = newCh;
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
                    ownerTitle: '',
                    isPinned: false,
                    isLocal: true,
                    isLocalOnly: !meta.server_channel_id
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
                        isLocalOnly: false
                    });
                }
            }

            this.channels = Array.from(merged.values());
            this.sortChannels();
            this.render();
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
            // Non-owners can't rename — lock the input at the HTML level
            // (visible via dim opacity in CSS) instead of letting them type
            // and then bouncing the change with a toast. Same pattern as
            // .vcs-list-branch[readonly].
            if (!this.isOwnerOf(ch)) {
                nameInput.readOnly = true;
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

            // Row 3: owner's title (or LOCAL if not yet cast) + pin tag
            const titleEl = document.createElement('div');
            titleEl.classList.add('broadcast-list-title');
            const ownerLabel = ch.isLocalOnly ? t('broadcast.statusLocal') : (ch.ownerTitle || ch.ownerUid || t('common.head'));
            titleEl.textContent = ownerLabel;
            if (ch.isPinned) {
                titleEl.style.flexDirection = 'row';
                const pinTag = document.createElement('span');
                pinTag.classList.add('crt-text-yellow');
                pinTag.textContent = t('broadcast.pinLabel');
                titleEl.appendChild(pinTag);
            }

            item.appendChild(nameInput);
            item.appendChild(lastSignalEl);
            item.appendChild(titleEl);
            this.elements.container.appendChild(item);
        });

        // Initialize or refresh InfiniteList — always position cursor at index 0
        if (this.infiniteList) {
            this.infiniteList.loop = Settings.get('bc', 'loopList');
            this.infiniteList.refresh();
        } else if (this.channels.length > 0) {
            this.infiniteList = new InfiniteList(
                this.elements.container,
                '.broadcast-list-list-item'
            );
            this.infiniteList.loop = Settings.get('bc', 'loopList');
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
