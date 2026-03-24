/**
 * Editor Attachments - Drop Zone & Chip Management (Local-First)
 * =================================================================
 * Shared module for file attachment UI.
 * Supports multiple file attachments per record.
 * Refactored to use Lazy Loading of DOM elements to prevent null reference issues.
 * =================================================================
 */

import { FileService } from './services/file-service.js';
import db from './indexedDB.js';
import { BBMessage } from './blackboard-msg.js';
import { t } from './i18n.js';
import * as Settings from './settings.js';

/**
 * Format file size in human-readable format.
 */
function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Get an icon character based on MIME type.
 */
function mimeIcon(mime) {
    if (!mime) return '📎';
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.startsWith('video/')) return '🎬';
    if (mime.startsWith('audio/')) return '🔊';
    if (mime.startsWith('text/')) return '📄';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar') ||
        mime.includes('7z') || mime.includes('compress') || mime.includes('archive')) return '📦';
    return '📎';
}

// const BLOB_MAX = 50;
const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1 GB

// Disabled: blob pruning removed to avoid data loss for local-only users.
// Synced blobs (server-backed) were evicted by LRU when count > BLOB_MAX,
// but local blobs had no server backup and were never pruned anyway.
// Keeping for potential future reuse with a user-facing quota/notification system.
//
// async function _pruneFileBlobs() {
//     const count = await db.file_blobs.count();
//     if (count <= BLOB_MAX) return;
//     // Only evict synced blobs (local-only blobs cannot be re-downloaded)
//     const synced = await db.file_blobs.where('status').equals('synced').toArray();
//     synced.sort((a, b) => (a.last_accessed ?? 0) - (b.last_accessed ?? 0));
//     const excess = count - BLOB_MAX;
//     const toDelete = synced.slice(0, excess).map(b => b.hash);
//     if (toDelete.length) await db.file_blobs.bulkDelete(toDelete);
// }

export const EditorAttachments = {
    /**
     * Create a new attachment manager instance.
     * @param {Object} config
     * @param {string} config.dropZoneSelector - Selector for drop zone
     * @param {string} config.fileInputSelector - Selector for file input
     * @param {string} config.chipsContainerSelector - Selector for chips container
     * @param {string} config.dropOverlaySelector - Selector for drop overlay
     * @param {boolean} [config.readOnly=false] - If true, disable editing/removal
     * @param {Function} config.onAttach - Callback when file is attached (hash, meta)
     * @param {Function} config.onDetach - Callback when file is detached (hash)
     * @returns {Object} Attachment manager instance
     */
    create(config) {
        const instance = {
            selectors: {
                dropZone: config.dropZoneSelector,
                fileInput: config.fileInputSelector,
                chipsContainer: config.chipsContainerSelector,
                dropOverlay: config.dropOverlaySelector
            },
            readOnly: config.readOnly || false,
            onAttach: config.onAttach || (() => { }),
            onDetach: config.onDetach || (() => { }),

            /** Current attached file hashes (multi-file support) */
            currentHashes: [],

            /** Backward-compatible getter: returns first hash or null */
            get currentHash() {
                return this.currentHashes.length > 0 ? this.currentHashes[0] : null;
            },
            set currentHash(val) {
                // Backward compat: setting to a single value or null
                if (val === null || val === undefined) {
                    this.currentHashes = [];
                } else {
                    this.currentHashes = [val];
                }
            },

            /** Prevent dragenter/dragleave flickering */
            _dragCounter: 0,

            /** Version counter — incremented on each setFromRecord() call to abort stale renders */
            _srVersion: 0,

            /**
             * Tracks any in-flight onDetach operation.
             * The drop event can fire while the remove-button click handler is still
             * awaiting onDetach's DB writes. Without serialisation, onAttach's
             * "bin → newData" write races against onDetach's "bin → null" write and
             * loses when onDetach finishes last, leaving the record with bin = null.
             */
            _detachPromise: null,

            /** Lazy lookup for DOM elements */
            _getEl(key) {
                const selector = this.selectors[key];
                return selector ? document.querySelector(selector) : null;
            },

            /**
             * Initialize event listeners.
             */
            init() {
                const dropZone = this._getEl('dropZone');
                const fileInput = this._getEl('fileInput');
                const chipsContainer = this._getEl('chipsContainer');

                // --- Drag Events (Edit Mode Only) ---
                if (!this.readOnly && dropZone) {
                    dropZone.addEventListener('dragenter', (e) => {
                        e.preventDefault();
                        this._dragCounter++;
                        if (this._dragCounter === 1) {
                            this._getEl('dropOverlay')?.classList.add('active');
                        }
                    });

                    dropZone.addEventListener('dragover', (e) => {
                        e.preventDefault();
                    });

                    dropZone.addEventListener('dragleave', (e) => {
                        e.preventDefault();
                        this._dragCounter--;
                        if (this._dragCounter <= 0) {
                            this._dragCounter = 0;
                            this._getEl('dropOverlay')?.classList.remove('active');
                        }
                    });

                    dropZone.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        this._dragCounter = 0;
                        this._getEl('dropOverlay')?.classList.remove('active');

                        const files = e.dataTransfer?.files;
                        if (files && files.length > 0) {
                            for (const file of files) {
                                await this.handleFile(file);
                            }
                        }
                    });

                    // --- Paste Images from Clipboard ---
                    dropZone.addEventListener('paste', async (e) => {
                        const items = e.clipboardData?.items;
                        if (!items) return;
                        for (const item of items) {
                            if (item.kind === 'file') {
                                e.preventDefault();
                                const file = item.getAsFile();
                                if (file) await this.handleFile(file);
                            }
                        }
                    });

                    // --- File Input (button trigger) ---
                    if (fileInput) {
                        fileInput.addEventListener('change', async (e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                                for (const file of files) {
                                    await this.handleFile(file);
                                }
                            }
                            e.target.value = '';
                        });
                    }
                }

                // --- Chip Remove (event delegation) ---
                if (!this.readOnly && chipsContainer) {
                    chipsContainer.addEventListener('click', async (e) => {
                        const removeBtn = e.target.closest('.attachment-chip-remove');
                        if (!removeBtn) return;
                        const hash = removeBtn.dataset.hash;
                        await this.detach(hash);
                    });
                }

                // --- Wheel → horizontal scroll ---
                if (chipsContainer) {
                    chipsContainer.addEventListener('wheel', (e) => {
                        if (chipsContainer.scrollWidth > chipsContainer.clientWidth) {
                            e.preventDefault();
                            chipsContainer.scrollLeft += e.deltaY;
                        }
                    }, { passive: false });
                }

                return this;
            },

            /**
             * Handle a single file (additive — does not remove existing attachments).
             * @param {File} file
             */
            async handleFile(file) {
                const scope = Settings.detectScope();
                const maxFiles = Settings.get(scope, 'maxFiles');
                if (this.currentHashes.length >= maxFiles) {
                    BBMessage.error(t('files.limitReached'));
                    return;
                }

                if (file.size > MAX_FILE_SIZE) {
                    BBMessage.error(t('files.tooLarge'));
                    return;
                }

                // If the user removed a file via the chip button and immediately dragged
                // a new one, onDetach may still be in-flight (DB: bin → null).
                if (this._detachPromise) {
                    await this._detachPromise;
                }

                // Skip duplicate: if this hash is already attached, ignore
                const preHash = await FileService.computeHash(file);
                if (this.currentHashes.includes(preHash)) return;

                this._appendLoadingChip();

                try {
                    const hash = preHash;

                    try {
                        await db.file_blobs.put({
                            hash: hash,
                            blob: file,
                            name: file.name,
                            type: file.type,
                            size: file.size,
                            status: 'local',
                            last_accessed: Date.now()
                        });
                    } catch (dbErr) {
                        if (dbErr.name === 'QuotaExceededError') {
                            BBMessage.error(t('files.storageFull'));
                            this._removeLoadingChip();
                            return;
                        }
                        throw dbErr;
                    }

                    this.currentHashes.push(hash);
                    // _pruneFileBlobs(); // Disabled: see comment at function definition

                    // Replace loading chip with real chip
                    this._removeLoadingChip();
                    this._appendChip({ hash, status: 'local', name: file.name });

                    // Await so that errors surface to the caller
                    await this.onAttach(hash, {
                        name: file.name,
                        size: file.size,
                        mime: file.type
                    });

                } catch (err) {
                    console.error('File processing failed:', err);
                    BBMessage.error(t('files.attachFailed'));
                    this._removeLoadingChip();
                }
            },

            /**
             * Detach a specific file by hash.
             * @param {string} hash
             */
            async detach(hash) {
                const idx = this.currentHashes.indexOf(hash);
                if (idx !== -1) this.currentHashes.splice(idx, 1);

                // Remove just this chip from DOM
                this._removeChip(hash);
                this._updateChipsVisibility();

                // Track the in-flight promise so handleFile() can wait for it
                this._detachPromise = this.onDetach(hash);
                try {
                    await this._detachPromise;
                } finally {
                    this._detachPromise = null;
                }
            },

            /**
             * Set attachment(s) from existing record.
             * Accepts a single hash (string), an array of hashes, or null.
             * Uses a version counter to abort stale async renders.
             * @param {string|string[]|null} hashOrHashes
             * @param {Object} [hint]
             */
            async setFromRecord(hashOrHashes, hint) {
                const version = ++this._srVersion;

                // Normalize input
                let hashes = [];
                if (Array.isArray(hashOrHashes)) {
                    hashes = hashOrHashes.filter(Boolean);
                } else if (typeof hashOrHashes === 'string' && hashOrHashes) {
                    hashes = [hashOrHashes];
                }

                this.currentHashes = [...hashes];

                if (hashes.length === 0) {
                    this._clearChips();
                    return;
                }

                this._clearChips();

                for (const hash of hashes) {
                    const localFile = await db.file_blobs.get(hash);

                    // Bail if a newer setFromRecord() call has already taken over
                    if (version !== this._srVersion) return;

                    if (localFile) {
                        this._appendChip({ hash, status: localFile.status || 'local', name: localFile.name });
                    } else {
                        this._appendChip({ hash, status: 'cloud' });
                    }
                }
            },

            /**
             * Clear all chips and reset state.
             */
            clear() {
                this.currentHashes = [];
                this._clearChips();
            },

            /**
             * Trigger browser "Save As" for a blob.
             */
            _saveBlobAs(blob, filename) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename || 'download';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            },

            /**
             * Ensure file blob is locally cached. Downloads from server if needed.
             * Returns { blob, name } or null on failure.
             */
            async _ensureLocal(hash) {
                const localFile = await db.file_blobs.get(hash);
                if (localFile?.blob) {
                    await db.file_blobs.update(hash, { last_accessed: Date.now() });
                    return { blob: localFile.blob, name: localFile.name };
                }

                // Cloud file — fetch from server and cache
                const loadingChip = this._findChip(hash);
                if (loadingChip) {
                    const icon = loadingChip.querySelector('.attachment-chip-icon');
                    if (icon) icon.textContent = t('files.statusWait');
                }

                const toastHandle = BBMessage.loading(t('files.downloading'));

                try {
                    const blob = await FileService.download(hash);
                    let meta = { name: 'downloaded_file', type: blob.type, size: blob.size };
                    try {
                        const serverMeta = await FileService.meta(hash);
                        meta = { name: serverMeta.name, type: serverMeta.mime, size: serverMeta.size };
                    } catch (e) { console.warn('EditorAttachments: meta fetch failed', e); }

                    await db.file_blobs.put({
                        hash, blob,
                        name: meta.name, type: meta.type, size: meta.size,
                        status: 'synced', last_accessed: Date.now()
                    });

                    const chip = this._findChip(hash);
                    if (chip) {
                        chip.classList.remove('is-local');
                        chip.classList.add('is-synced');
                        const icon = chip.querySelector('.attachment-chip-icon');
                        if (icon) icon.textContent = t('files.statusSync');
                        const nameEl = chip.querySelector('.attachment-chip-name');
                        if (nameEl && meta.name) {
                            nameEl.textContent = meta.name;
                            nameEl.title = meta.name;
                        }
                    }

                    toastHandle.update(t('files.downloadSuccess'));
                    return { blob, name: meta.name };
                } catch (e) {
                    console.error("Download failed", e);
                    toastHandle.update(t('files.downloadFailed'));
                    return null;
                }
            },

            /**
             * Open file in browser (new tab preview).
             */
            async openFile(hash) {
                const file = await this._ensureLocal(hash);
                if (!file) return;
                const url = URL.createObjectURL(file.blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            },

            /**
             * Download file to user's downloads folder.
             */
            async downloadFile(hash) {
                const file = await this._ensureLocal(hash);
                if (!file) return;
                this._saveBlobAs(file.blob, file.name);
            },

            // === Private Rendering Methods ===

            _findChip(hash) {
                const container = this._getEl('chipsContainer');
                return container ? container.querySelector(`.attachment-chip[data-hash="${hash}"]`) : null;
            },

            _clearChips() {
                const container = this._getEl('chipsContainer');
                if (container) {
                    container.innerHTML = '';
                    container.classList.remove('has-items');
                }
            },

            _removeChip(hash) {
                const chip = this._findChip(hash);
                if (chip) chip.remove();
            },

            _updateChipsVisibility() {
                const container = this._getEl('chipsContainer');
                if (!container) return;
                if (container.children.length > 0) {
                    container.classList.add('has-items');
                } else {
                    container.classList.remove('has-items');
                }
            },

            _appendChip({ hash, status, name }) {
                // status: 'local' = only on this device (orange)
                //         'synced' = on server + cached locally (green)
                //         'cloud'  = on server, not cached locally (green)
                const container = this._getEl('chipsContainer');
                if (!container) return;

                const chip = document.createElement('div');
                chip.className = 'attachment-chip';
                chip.dataset.hash = hash;

                let iconText;
                if (status === 'local') {
                    iconText = t('files.statusLocal');
                    chip.classList.add('is-local');
                } else if (status === 'synced') {
                    iconText = t('files.statusSync');
                    chip.classList.add('is-synced');
                } else {
                    iconText = t('files.statusCloud');
                }

                const removeHtml = this.readOnly ? '' :
                    `<button class="attachment-chip-remove" data-hash="${hash}" title="Remove">${t('files.removeBtn')}</button>`;

                const displayName = name || hash.substring(0, 8) + '…';

                chip.innerHTML = `
                    <div class="attachment-chip-top">
                        <span class="attachment-chip-name"></span>
                        <span class="attachment-chip-download" data-hash="${hash}">${t('files.downloadBtn')}</span>
                    </div>
                    <div class="attachment-chip-bottom">
                        <span class="attachment-chip-icon" style="cursor: pointer;">${iconText}</span>
                        ${removeHtml}
                    </div>
                `;

                // Set name via textContent to prevent XSS from file names
                const nameEl = chip.querySelector('.attachment-chip-name');
                nameEl.textContent = displayName;
                nameEl.title = name || hash;

                chip.querySelector('.attachment-chip-download').addEventListener('click', () => {
                    this.downloadFile(hash);
                });

                chip.querySelector('.attachment-chip-icon').addEventListener('click', () => {
                    this.openFile(hash);
                });

                container.appendChild(chip);
                container.classList.add('has-items');
            },

            _appendLoadingChip() {
                const container = this._getEl('chipsContainer');
                if (!container) return;

                const chip = document.createElement('div');
                chip.className = 'attachment-chip attachment-chip-loading';
                chip.innerHTML = `<span class="attachment-chip-icon">${t('files.statusWait')}</span>`;

                container.appendChild(chip);
                container.classList.add('has-items');
            },

            _removeLoadingChip() {
                const container = this._getEl('chipsContainer');
                if (!container) return;
                const loading = container.querySelector('.attachment-chip-loading');
                if (loading) loading.remove();
                this._updateChipsVisibility();
            },

            // Backward compat: old _renderChip still works for single chip replacement
            _renderChip({ hash, status }) {
                this._clearChips();
                this._appendChip({ hash, status });
            },

            _renderLoadingChip() {
                this._clearChips();
                this._appendLoadingChip();
            }
        };

        return instance.init();
    },
};
