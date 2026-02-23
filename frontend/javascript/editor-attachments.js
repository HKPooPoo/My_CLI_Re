/**
 * Editor Attachments - Drop Zone & Chip Management (Local-First)
 * =================================================================
 * Shared module for file attachment UI.
 * Refactored to use Lazy Loading of DOM elements to prevent null reference issues.
 * =================================================================
 */

import { FileService } from './services/file-service.js';
import db from './indexedDB.js';
import { BBMessage } from './blackboard-msg.js';

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

const BLOB_MAX = 50;
const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1 GB

async function _pruneFileBlobs() {
    const count = await db.fileBlobs.count();
    if (count <= BLOB_MAX) return;
    // Only evict synced blobs (local-only blobs cannot be re-downloaded)
    const synced = await db.fileBlobs.where('status').equals('synced').toArray();
    synced.sort((a, b) => (a.lastAccessed ?? 0) - (b.lastAccessed ?? 0));
    const excess = count - BLOB_MAX;
    const toDelete = synced.slice(0, excess).map(b => b.hash);
    if (toDelete.length) await db.fileBlobs.bulkDelete(toDelete);
}

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

            /** Current attached file hash */
            currentHash: null,

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

                    dropZone.addEventListener('drop', (e) => {
                        e.preventDefault();
                        this._dragCounter = 0;
                        this._getEl('dropOverlay')?.classList.remove('active');

                        const files = e.dataTransfer?.files;
                        if (files && files.length > 0) {
                            this.handleFile(files[0]);
                        }
                    });

                    // --- File Input (button trigger) ---
                    if (fileInput) {
                        fileInput.addEventListener('change', (e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                                this.handleFile(files[0]);
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

                return this;
            },

            /**
             * Handle a single file.
             * @param {File} file
             */
            async handleFile(file) {
                if (file.size > MAX_FILE_SIZE) {
                    BBMessage.error('FILE TOO LARGE: MAX 1 GB');
                    return;
                }

                // If the user removed a file via the chip button and immediately dragged
                // a new one, onDetach may still be in-flight (DB: bin → null).
                // We must wait for it to finish before starting onAttach (bin → newData),
                // otherwise onDetach's write lands last and silently wipes the new bin.
                if (this._detachPromise) {
                    await this._detachPromise;
                }

                // Await detach so onDetach completes BEFORE onAttach runs.
                // Without this, onDetach's async DB write (bin → null) would
                // race against onAttach's write (bin → newData) and wipe the new bin.
                if (this.currentHash) {
                    await this.detach(this.currentHash);
                }

                this._renderLoadingChip();

                try {
                    const hash = await FileService.computeHash(file);

                    try {
                        await db.fileBlobs.put({
                            hash: hash,
                            blob: file,
                            name: file.name,
                            type: file.type,
                            size: file.size,
                            status: 'local',
                            lastAccessed: Date.now()
                        });
                    } catch (dbErr) {
                        if (dbErr.name === 'QuotaExceededError') {
                            BBMessage.error("STORAGE FULL");
                            this._clearChips();
                            return;
                        }
                        throw dbErr;
                    }

                    this.currentHash = hash;
                    _pruneFileBlobs(); // fire-and-forget

                    this._renderChip({ hash, status: 'local' });

                    // Await so that errors surface to the caller
                    await this.onAttach(hash, {
                        name: file.name,
                        size: file.size,
                        mime: file.type
                    });

                } catch (err) {
                    console.error('File processing failed:', err);
                    BBMessage.error("ATTACH FAILED");
                    this._clearChips();
                }
            },

            /**
             * Detach a file.
             * @param {string} hash
             */
            async detach(hash) {
                if (this.currentHash === hash) {
                    this.currentHash = null;
                }
                this._clearChips();
                // Track the in-flight promise so handleFile() can wait for it
                // if a new drop arrives before this onDetach finishes.
                this._detachPromise = this.onDetach(hash);
                try {
                    await this._detachPromise;
                } finally {
                    this._detachPromise = null;
                }
            },

            /**
             * Set attachment from existing record.
             * Uses a version counter to abort stale async renders — prevents
             * a superseded call from overwriting a chip rendered by a newer call.
             * @param {string|null} hash
             * @param {Object} [hint]
             */
            async setFromRecord(hash, hint) {
                const version = ++this._srVersion;
                this.currentHash = hash || null;
                if (!hash) {
                    // Immediate clear is correct — no async work needed for null
                    this._clearChips();
                    return;
                }

                const localFile = await db.fileBlobs.get(hash);

                // Bail if a newer setFromRecord() call has already taken over
                if (version !== this._srVersion) return;

                if (localFile) {
                    // 'local' = not yet on server | 'synced' = on server + cached
                    this._renderChip({ hash, status: localFile.status || 'local' });
                } else {
                    this._renderChip({ hash, status: 'cloud' });
                }
            },

            /**
             * Clear all chips and reset state.
             */
            clear() {
                this.currentHash = null;
                this._clearChips();
            },

            /**
             * Helper to open a file.
             */
            async openFile(hash) {
                let localFile = await db.fileBlobs.get(hash);

                if (localFile?.blob) {
                    await db.fileBlobs.update(hash, { lastAccessed: Date.now() });
                }

                if (!localFile || !localFile.blob) {
                    const loadingMsg = this._findChip(hash);
                    if (loadingMsg) {
                        const icon = loadingMsg.querySelector('.attachment-chip-icon');
                        if (icon) icon.textContent = '[WAIT]';
                    }

                    try {
                        const blob = await FileService.download(hash);
                        let meta = { name: 'downloaded_file', type: blob.type, size: blob.size };
                        try {
                            const serverMeta = await FileService.meta(hash);
                            meta = { name: serverMeta.name, type: serverMeta.mime, size: serverMeta.size };
                        } catch (e) { console.warn('EditorAttachments: meta fetch failed', e); }

                        localFile = {
                            hash: hash,
                            blob: blob,
                            name: meta.name,
                            type: meta.type,
                            size: meta.size,
                            status: 'synced',
                            lastAccessed: Date.now()
                        };

                        await db.fileBlobs.put(localFile);
                        this._renderChip({ hash: hash, status: 'synced' });

                    } catch (e) {
                        console.error("Download failed", e);
                        BBMessage.error('DOWNLOAD FAILED');
                        window.open(FileService.downloadUrl(hash), '_blank');
                        return;
                    }
                }

                if (localFile && localFile.blob) {
                    const url = URL.createObjectURL(localFile.blob);
                    window.open(url, '_blank');
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                }
            },

            // === Private Rendering Methods ===

            _findChip(hash) {
                const container = this._getEl('chipsContainer');
                // Query data-hash on the chip itself — works for both editable and read-only chips
                return container ? container.querySelector(`.attachment-chip[data-hash="${hash}"]`) : null;
            },

            _clearChips() {
                const container = this._getEl('chipsContainer');
                if (container) {
                    container.innerHTML = '';
                    container.classList.remove('has-items');
                }
            },

            _renderChip({ hash, status }) {
                // status: 'local' = only on this device (orange)
                //         'synced' = on server + cached locally (green)
                //         'cloud'  = on server, not cached locally (green)
                const container = this._getEl('chipsContainer');
                if (!container) return;
                this._clearChips();

                const chip = document.createElement('div');
                chip.className = 'attachment-chip';
                chip.dataset.hash = hash; // used by _findChip() — works for read-only too

                let iconText;
                if (status === 'local') {
                    iconText = '[LOCAL]';
                    chip.classList.add('is-local');
                } else if (status === 'synced') {
                    iconText = '[SYNC]';
                    chip.classList.add('is-synced');
                } else {
                    iconText = '[CLOUD]';
                }

                const removeHtml = this.readOnly ? '' :
                    `<button class="attachment-chip-remove" data-hash="${hash}" title="Remove">[X]</button>`;

                chip.innerHTML = `
                    <span class="attachment-chip-icon" style="cursor: pointer;" title="Open File">${iconText}</span>
                    ${removeHtml}
                `;

                const iconEl = chip.querySelector('.attachment-chip-icon');
                iconEl.addEventListener('click', () => {
                    this.openFile(hash);
                });

                container.appendChild(chip);
                container.classList.add('has-items');
            },

            _renderLoadingChip() {
                const container = this._getEl('chipsContainer');
                if (!container) return;
                this._clearChips();

                const chip = document.createElement('div');
                chip.className = 'attachment-chip';
                chip.innerHTML = `<span class="attachment-chip-icon">[WAIT]</span>`;

                container.appendChild(chip);
                container.classList.add('has-items');
            }
        };

        return instance.init();
    },
};
