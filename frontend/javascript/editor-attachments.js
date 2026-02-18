/**
 * Editor Attachments - Drop Zone & Chip Management (Local-First)
 * =================================================================
 * Shared module for file attachment UI.
 * Refactored to use Lazy Loading of DOM elements to prevent null reference issues.
 * =================================================================
 */

import { FileService } from './services/file-service.js';
import db from './indexedDB.js';

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
                    chipsContainer.addEventListener('click', (e) => {
                        const removeBtn = e.target.closest('.attachment-chip-remove');
                        if (!removeBtn) return;
                        const hash = removeBtn.dataset.hash;
                        this.detach(hash);
                    });
                }

                return this;
            },

            /**
             * Handle a single file.
             * @param {File} file
             */
            async handleFile(file) {
                if (this.currentHash) {
                    this.detach(this.currentHash);
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
                            status: 'local'
                        });
                    } catch (dbErr) {
                        if (dbErr.name === 'QuotaExceededError') {
                            alert("STORAGE FULL.");
                            this._clearChips();
                            return;
                        }
                        throw dbErr;
                    }

                    this.currentHash = hash;

                    this._renderChip({
                        hash: hash,
                        isLocal: true
                    });

                    this.onAttach(hash, {
                        name: file.name,
                        size: file.size,
                        mime: file.type
                    });

                } catch (err) {
                    console.error('File processing failed:', err);
                    alert("ATTACH ERROR: " + (err.message || err));
                    this._clearChips();
                }
            },

            /**
             * Detach a file.
             * @param {string} hash
             */
            detach(hash) {
                if (this.currentHash === hash) {
                    this.currentHash = null;
                }
                this._clearChips();
                this.onDetach(hash);
            },

            /**
             * Set attachment from existing record.
             * @param {string|null} hash
             * @param {Object} [hint]
             */
            async setFromRecord(hash, hint) {
                this._clearChips();
                this.currentHash = hash || null;
                if (!hash) return;

                const localFile = await db.fileBlobs.get(hash);

                if (localFile) {
                    this._renderChip({
                        hash: hash,
                        isLocal: true
                    });
                } else {
                    this._renderChip({
                        hash: hash,
                        isLocal: false
                    });
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
                        } catch (e) {}

                        localFile = {
                            hash: hash,
                            blob: blob,
                            name: meta.name,
                            type: meta.type,
                            size: meta.size,
                            status: 'synced'
                        };

                        await db.fileBlobs.put(localFile);
                        this._renderChip({ hash: hash, isLocal: true });

                    } catch (e) {
                        console.error("Download failed", e);
                        alert("DOWNLOAD FAILED.");
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
                return container ? container.querySelector(`.attachment-chip-remove[data-hash="${hash}"]`)?.closest('.attachment-chip') : null;
            },

            _clearChips() {
                const container = this._getEl('chipsContainer');
                if (container) {
                    container.innerHTML = '';
                    container.classList.remove('has-items');
                }
            },

            _renderChip({ hash, isLocal }) {
                const container = this._getEl('chipsContainer');
                if (!container) return;
                this._clearChips();

                const chip = document.createElement('div');
                chip.className = 'attachment-chip';
                if (isLocal) chip.classList.add('is-local');

                const iconText = isLocal ? '[LOC]' : '[CLD]';
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
