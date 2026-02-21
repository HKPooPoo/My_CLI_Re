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
import { BCDb, BCMeta, getHKTTimestamp } from './broadcast-db.js';
import { InfiniteList } from './blackboard-ui-list.js';
import { MultiStepButton } from './multiStepButton.js';
import { BBMessage } from './blackboard-msg.js';

// Sub-navi <---> text element — updated when channel is selected or renamed
const $bcNaviText = document.querySelector(
    '.sub-navi-item[data-sub-navi-item="broadcast-channel"] .sub-navi-item-text'
);

export const BCList = {
    elements: {
        container:  document.querySelector('.broadcast-list-list-container'),
        pinBtn:     document.getElementById('broadcast-pin-btn'),
        castBtn:    document.getElementById('broadcast-cast-btn'),
        createBtn:  document.getElementById('broadcast-create-btn'),
        deleteBtn:  document.getElementById('broadcast-delete-btn'),
    },

    channels: [],          // Merged list: { localId, serverChannelId, name, lastSignal, ownerTitle, ownerUid, isPinned, isLocal }
    infiniteList: null,
    selectionTimer: null,
    selectedChannel: null,

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
        if (this.elements.castBtn)   this.elements.castBtn.style.display   = show ? '' : 'none';
        if (this.elements.createBtn) this.elements.createBtn.style.display = show ? '' : 'none';
        if (this.elements.deleteBtn) this.elements.deleteBtn.style.display = show ? '' : 'none';
    },

    // =====================================================================
    //  Events
    // =====================================================================

    bindEvents() {
        // Auth change → refresh list + re-evaluate button visibility
        window.addEventListener('blackboard:authUpdated', () => {
            this.lockTitleButtons();
            this.fetchAndRender();
        });

        // Window focus → re-fetch public channels
        window.addEventListener('focus', () => this.fetchAndRender());

        // InfiniteList cursor → 500ms debounce → dispatch broadcast:selected
        window.addEventListener('blackboard:selectionChanged', (e) => {
            const { item } = e.detail;
            if (!item || !this.elements.container?.contains(item)) return;

            const localId = parseInt(item.dataset.localId);
            const ch = this.channels.find(c => c.localId === localId);
            if (!ch) return;

            this.selectedChannel = ch;

            clearTimeout(this.selectionTimer);
            this.selectionTimer = setTimeout(() => {
                this.updateNaviText(ch.name);
                window.dispatchEvent(new CustomEvent('broadcast:selected', { detail: ch }));
            }, 500);
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

        // --- PIN ---
        if (this.elements.pinBtn) {
            this.elements.pinBtn.addEventListener('click', async () => {
                if (!this.selectedChannel) return BBMessage.error('ERROR: NO TARGET');

                const ch = this.selectedChannel;
                const isLoggedIn = !!localStorage.getItem('currentUser');

                if (!isLoggedIn || !ch.serverChannelId) {
                    // Cannot pin local-only or when not logged in
                    return BBMessage.error('ERROR: LOGIN REQUIRED TO PIN');
                }

                try {
                    if (ch.isPinned) {
                        await BroadcastService.unpin(ch.serverChannelId);
                        ch.isPinned = false;
                        BBMessage.info('UNPINNED');
                    } else {
                        await BroadcastService.pin(ch.serverChannelId);
                        ch.isPinned = true;
                        BBMessage.info('PINNED');
                    }
                    // Re-sort and re-render to reflect new pin state
                    this.sortChannels();
                    this.render();
                } catch (e) {
                    console.error('PIN ERROR:', e);
                    BBMessage.error('ERROR: PIN FAILED');
                }
            });
        }

        // --- CAST ---
        if (this.elements.castBtn) {
            new MultiStepButton(this.elements.castBtn, [
                { label: 'CAST', sound: 'UIGeneralFocus.mp3', action: () => {} },
                {
                    label: 'SURE?',
                    sound: 'UIPipboyOK.mp3',
                    action: async () => {
                        if (!this.hasTitle()) return BBMessage.error('ERROR: TITLE REQUIRED');
                        if (!this.selectedChannel) return BBMessage.error('ERROR: NO TARGET');
                        if (!this.isOwnerOf(this.selectedChannel)) return BBMessage.error('ERROR: NOT OWNER');

                        const ch = this.selectedChannel;
                        const msg = BBMessage.info('CASTING...');

                        try {
                            // Gather local board records
                            const localRecords = await BCDb.getAllRecords(ch.localId);
                            const apiRecords = localRecords
                                .filter(r => (r.text && r.text.trim()) || r.bin)
                                .map(r => ({
                                    timestamp: r.timestamp,
                                    text: r.text || '',
                                    bin: (r.bin && typeof r.bin === 'object') ? r.bin.hash : r.bin
                                }));

                            const result = await BroadcastService.cast({
                                channelName: ch.name,
                                records: apiRecords
                            });

                            const serverCh = result.channel;

                            // Store server ID mapping locally
                            await BCMeta.setServerChannelId(ch.localId, serverCh.id);
                            await BCMeta.updateLastSignal(ch.localId, serverCh.last_signal);

                            ch.serverChannelId = serverCh.id;
                            ch.lastSignal = serverCh.last_signal;

                            msg.update('CAST COMPLETE');
                            await this.fetchAndRender();
                        } catch (e) {
                            console.error('CAST ERROR:', e);
                            msg.close();
                            BBMessage.error('ERROR: CAST FAILED');
                        }
                    }
                }
            ]);
        }

        // --- CREATE --- (regardless of selected item)
        if (this.elements.createBtn) {
            new MultiStepButton(this.elements.createBtn, [
                { label: 'CREATE', sound: 'UIGeneralFocus.mp3', action: () => {} },
                {
                    label: 'SURE?',
                    sound: 'UIPipboyOKPress.mp3',
                    action: async () => {
                        if (!this.hasTitle()) return BBMessage.error('ERROR: TITLE REQUIRED');

                        const autoName = `BC_${Date.now()}`;
                        const msg = BBMessage.info('CREATING...');

                        try {
                            const localId = await BCMeta.createChannel(autoName);
                            // Create initial empty board record
                            await BCDb.addRecord(localId, '');

                            msg.update('CREATE COMPLETE');
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
                            msg.close();
                            BBMessage.error('ERROR: CREATE FAILED');
                        }
                    }
                }
            ]);
        }

        // --- DELETE ---
        if (this.elements.deleteBtn) {
            new MultiStepButton(this.elements.deleteBtn, [
                { label: 'DELETE', sound: 'UIGeneralFocus.mp3', action: () => {} },
                {
                    label: 'SURE?',
                    sound: 'UIGeneralCancel.mp3',
                    action: async () => {
                        if (!this.hasTitle()) return BBMessage.error('ERROR: TITLE REQUIRED');
                        if (!this.selectedChannel) return BBMessage.error('ERROR: NO TARGET');
                        if (!this.isOwnerOf(this.selectedChannel)) return BBMessage.error('ERROR: NOT OWNER');

                        const ch = this.selectedChannel;
                        const msg = BBMessage.info('DELETING...');

                        try {
                            // Delete from server if cast
                            if (ch.serverChannelId) {
                                await BroadcastService.destroy(ch.serverChannelId);
                            }
                            // Delete local data
                            await BCMeta.deleteChannel(ch.localId);

                            this.selectedChannel = null;
                            this.updateNaviText('');

                            msg.update('DELETE COMPLETE');
                            window.dispatchEvent(new CustomEvent('broadcast:cleared'));
                            await this.fetchAndRender();
                        } catch (e) {
                            console.error('DELETE ERROR:', e);
                            msg.close();
                            BBMessage.error('ERROR: DELETE FAILED');
                        }
                    }
                }
            ]);
        }
    },

    // =====================================================================
    //  Data Loading
    // =====================================================================

    async fetchAndRender() {
        try {
            // 1. Fetch server public channels
            const data = await BroadcastService.listChannels();
            const serverChannels = data?.channels ?? [];

            // 2. Fetch local channel metadata from IndexedDB
            const localMetas = await BCMeta.getAllChannels();

            // Build merged list — avoid duplicates between local and server
            const merged = new Map(); // key: localId

            // Add local channels first
            for (const meta of localMetas) {
                merged.set(meta.localId, {
                    localId:         meta.localId,
                    serverChannelId: meta.serverChannelId ?? null,
                    name:            meta.name,
                    lastSignal:      meta.lastSignal ?? 0,
                    ownerUid:        meta.ownerUid ?? '',
                    ownerTitle:      '',  // will fill from server if cast
                    isPinned:        false,
                    isLocal:         true,
                    isLocalOnly:     !meta.serverChannelId
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
                    found.name       = sch.name;
                    found.lastSignal = sch.last_signal;
                    found.ownerUid   = sch.owner_uid;
                    found.ownerTitle = sch.owner_title ?? '';
                    found.isPinned   = sch.is_pinned ?? false;
                    found.isLocalOnly = false;
                } else {
                    // Server-only channel (not owned locally)
                    const pseudoLocalId = -(sch.id); // negative to avoid collision with Dexie auto-increment
                    merged.set(pseudoLocalId, {
                        localId:         pseudoLocalId,
                        serverChannelId: sch.id,
                        name:            sch.name,
                        lastSignal:      sch.last_signal,
                        ownerUid:        sch.owner_uid,
                        ownerTitle:      sch.owner_title ?? '',
                        isPinned:        sch.is_pinned ?? false,
                        isLocal:         false,
                        isLocalOnly:     false
                    });
                }
            }

            this.channels = Array.from(merged.values());
            this.sortChannels();
            this.render();
        } catch (e) {
            console.warn('BCList: Fetch failed', e);
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

        this.elements.container.innerHTML = '';

        this.channels.forEach(ch => {
            const item = document.createElement('div');
            item.classList.add('broadcast-list-list-item');
            item.dataset.localId = ch.localId;

            // Row 1: channel name (editable input)
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.classList.add('broadcast-list-tag');
            nameInput.placeholder = 'Channel name...';
            nameInput.name = 'broadcast-list-tag';
            nameInput.value = ch.name;

            nameInput.addEventListener('change', async (e) => {
                const newName = e.target.value.trim();
                if (!newName) {
                    e.target.value = ch.name;
                    return BBMessage.error('ERROR: NAME CANNOT BE EMPTY');
                }
                if (!this.isOwnerOf(ch)) {
                    e.target.value = ch.name;
                    return BBMessage.error('ERROR: NOT OWNER');
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
                    BBMessage.error('ERROR: RENAME FAILED');
                }
            });

            // Prevent InfiniteList from swallowing input events
            nameInput.addEventListener('click', e => e.stopPropagation());
            nameInput.addEventListener('keydown', e => e.stopPropagation());

            // Row 2: last signal timestamp
            const lastSignalEl = document.createElement('div');
            lastSignalEl.classList.add('broadcast-list-last-signal');
            lastSignalEl.textContent = ch.lastSignal ? getHKTTimestamp(ch.lastSignal) : '---';

            // Row 3: owner's title (or LOCAL if not yet cast)
            const titleEl = document.createElement('div');
            titleEl.classList.add('broadcast-list-title');
            titleEl.textContent = ch.isLocalOnly ? 'LOCAL' : (ch.ownerTitle || ch.ownerUid || '---');

            item.appendChild(nameInput);
            item.appendChild(lastSignalEl);
            item.appendChild(titleEl);
            this.elements.container.appendChild(item);
        });

        // Initialize or refresh InfiniteList — always position cursor at index 0
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

    updateNaviText(name) {
        if ($bcNaviText) {
            $bcNaviText.textContent = name ? name : '<-->';
        }
    }
};

// Init
BCList.init();
BCList.fetchAndRender();
