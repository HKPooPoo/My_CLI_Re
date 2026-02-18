/**
 * Editor Attachments - Drop Zone & Chip Management (Local-First)
 * =================================================================
 * Shared module for file attachment UI.
 * Now implements Local-First architecture:
 * 1. Drop -> SHA-256 -> IndexedDB (fileBlobs)
 * 2. Commit -> Sync to Server
 * 3. Checkout -> Lazy Download
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
     * @param {HTMLElement} config.dropZone - The editor-wrapper element
     * @param {HTMLInputElement} config.fileInput - Hidden file input
     * @param {HTMLElement} config.chipsContainer - Chips container
     * @param {HTMLElement} config.dropOverlay - Drop overlay element
     * @param {boolean} [config.readOnly=false] - If true, disable editing/removal
     * @param {Function} config.onAttach - Callback when file is attached (hash)
     * @param {Function} config.onDetach - Callback when file is detached (hash)
     * @returns {Object} Attachment manager instance
     */
    create(config) {
        const instance = {
            dropZone: config.dropZone,
            fileInput: config.fileInput,
            chipsContainer: config.chipsContainer,
            dropOverlay: config.dropOverlay,
            readOnly: config.readOnly || false,
            onAttach: config.onAttach || (() => { }),
            onDetach: config.onDetach || (() => { }),

            /** Current attached file hash */
            currentHash: null,

            /** Prevent dragenter/dragleave flickering */
            _dragCounter: 0,

            /**
             * Initialize drag-and-drop and file input event listeners.
             */
            init() {
                if (!this.dropZone && !this.chipsContainer) return this;

                // --- Drag Events (Edit Mode Only) ---
                if (!this.readOnly && this.dropZone) {
                    this.dropZone.addEventListener('dragenter', (e) => {
                        e.preventDefault();
                        this._dragCounter++;
                        if (this._dragCounter === 1) {
                            this.dropOverlay?.classList.add('active');
                        }
                    });

                    this.dropZone.addEventListener('dragover', (e) => {
                        e.preventDefault(); // Required to allow drop
                    });

                    this.dropZone.addEventListener('dragleave', (e) => {
                        e.preventDefault();
                        this._dragCounter--;
                        if (this._dragCounter <= 0) {
                            this._dragCounter = 0;
                            this.dropOverlay?.classList.remove('active');
                        }
                    });

                    this.dropZone.addEventListener('drop', (e) => {
                        e.preventDefault();
                        this._dragCounter = 0;
                        this.dropOverlay?.classList.remove('active');

                        const files = e.dataTransfer?.files;
                        if (files && files.length > 0) {
                            this.handleFile(files[0]);
                        }
                    });

                    // --- File Input (button trigger) ---
                    this.fileInput?.addEventListener('change', (e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                            this.handleFile(files[0]);
                        }
                        if (this.fileInput) this.fileInput.value = '';
                    });
                }

                // --- Chip Remove (event delegation) ---
                if (!this.readOnly) {
                    this.chipsContainer?.addEventListener('click', (e) => {
                        const removeBtn = e.target.closest('.attachment-chip-remove');
                        if (!removeBtn) return;
                        const hash = removeBtn.dataset.hash;
                        this.detach(hash);
                    });
                }

                return this;
            },

            /**
             * Handle a single file: Hash -> IndexedDB -> Render.
             * @param {File} file
             */
            async handleFile(file) {
                if (this.currentHash) {
                    this.detach(this.currentHash);
                }

                this._renderLoadingChip(file.name, file.size);

                try {
                    // 1. Compute Hash (Local)
                    const hash = await FileService.computeHash(file);

                    // 2. Store in IndexedDB (fileBlobs)
                    // We try-catch put() to handle QuotaExceededError
                    try {
                        await db.fileBlobs.put({
                            hash: hash,
                            blob: file,
                            name: file.name,
                            type: file.type,
                            size: file.size,
                            status: 'local' // Needs sync
                        });
                    } catch (dbErr) {
                        if (dbErr.name === 'QuotaExceededError') {
                            alert("STORAGE FULL. CANNOT SAVE FILE LOCALLY.");
                            this._clearChips();
                            return;
                        }
                        throw dbErr;
                    }

                    this.currentHash = hash;

                    // 3. Render Chip (Local)
                    this._renderChip({
                        hash: hash,
                        name: file.name,
                        size: file.size,
                        mime: file.type,
                        isLocal: true
                    });

                    this.onAttach(hash, {
                        name: file.name,
                        size: file.size,
                        mime: file.type
                    });

                } catch (err) {
                    console.error('File processing failed:', err);
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
             * Set attachment from existing record (Lazy Load).
             * @param {string|null} hash
             * @param {Object} [hint] - Optional metadata hint { name, size, mime } from record
             */
            async setFromRecord(hash, hint) {
                this._clearChips();
                this.currentHash = hash || null;
                if (!hash) return;

                // 1. Check Local DB
                const localFile = await db.fileBlobs.get(hash);

                if (localFile) {
                    this._renderChip({
                        hash: hash,
                        name: localFile.name,
                        size: localFile.size,
                        mime: localFile.type,
                        isLocal: true
                    });
                } else {
                    // 2. Not local? Show placeholder or hint immediately
                    if (hint) {
                        this._renderChip({
                            hash: hash,
                            name: hint.name,
                            size: hint.size,
                            mime: hint.mime,
                            isLocal: false // Cloud
                        });
                    } else {
                        // 3. No hint? Fetch Meta
                        try {
                            this._renderLoadingChip("LOADING META...", 0);
                            const meta = await FileService.meta(hash);
                            this._renderChip({
                                hash: hash,
                                name: meta.name,
                                size: meta.size,
                                mime: meta.mime,
                                isLocal: false
                            });
                        } catch (e) {
                            this._renderChip({
                                hash: hash,
                                name: "MISSING FILE",
                                size: 0,
                                mime: null,
                                isLocal: false
                            });
                        }
                    }
                }
            },

            /**
             * Helper to open a file (Local Blob or Remote Download).
             * If remote, it downloads, caches, and then opens.
             */
            async openFile(hash) {
                let localFile = await db.fileBlobs.get(hash);

                if (!localFile || !localFile.blob) {
                    // Not local? Download and Cache!
                    const loadingMsg = this._findChip(hash);
                    if (loadingMsg) loadingMsg.querySelector('.attachment-chip-icon').textContent = '[LOADING...]';

                    try {
                        const blob = await FileService.download(hash);

                        // We need metadata. If we don't have it locally, fetch meta or use defaults
                        let meta = { name: 'downloaded_file', type: blob.type, size: blob.size };
                        try {
                            const serverMeta = await FileService.meta(hash);
                            meta = { name: serverMeta.name, type: serverMeta.mime, size: serverMeta.size };
                        } catch (e) {
                            console.warn("Meta fetch failed during cache, using blob props", e);
                        }

                        // Store in IDB
                        localFile = {
                            hash: hash,
                            blob: blob,
                            name: meta.name,
                            type: meta.type,
                            size: meta.size,
                            status: 'synced' // It came from server
                        };

                        await db.fileBlobs.put(localFile);

                        // Update UI to Local
                        this._renderChip({
                            hash: hash,
                            name: localFile.name,
                            size: localFile.size,
                            mime: localFile.type,
                            isLocal: true
                        });

                    } catch (e) {
                        console.error("Download failed", e);
                        alert("DOWNLOAD FAILED.");
                        // Fallback to direct link if cache fails
                        window.open(FileService.downloadUrl(hash), '_blank');
                        return;
                    }
                }

                // Open Local Blob
                if (localFile && localFile.blob) {
                    const url = URL.createObjectURL(localFile.blob);
                    window.open(url, '_blank');
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                }
            },

            // === Private Rendering Methods ===

            _findChip(hash) {
                return this.chipsContainer ? this.chipsContainer.querySelector(`.attachment-chip-remove[data-hash="${hash}"]`)?.closest('.attachment-chip') : null;
            },

            _clearChips() {
                if (this.chipsContainer) {
                    this.chipsContainer.innerHTML = '';
                    this.chipsContainer.classList.remove('has-items');
                }
            },

            _renderChip({ hash, isLocal }) {
                if (!this.chipsContainer) return;
                this._clearChips();

                const chip = document.createElement('div');
                chip.className = 'attachment-chip';
                // Add class if local or cloud
                if (isLocal) chip.classList.add('is-local');

                const iconText = isLocal ? '[LOC]' : '[CLD]';
                const removeHtml = this.readOnly ? '' :
                    `<button class="attachment-chip-remove" data-hash="${hash}" title="Remove">[X]</button>`;

                chip.innerHTML = `
                    <span class="attachment-chip-icon" style="cursor: pointer;" title="Open File">${iconText}</span>
                    ${removeHtml}
                `;

                // Click icon -> Open
                const iconEl = chip.querySelector('.attachment-chip-icon');
                iconEl.addEventListener('click', () => {
                    this.openFile(hash);
                });

                this.chipsContainer.appendChild(chip);
                this.chipsContainer.classList.add('has-items');
            },

            _renderLoadingChip() {
                if (!this.chipsContainer) return;
                this._clearChips();

                const chip = document.createElement('div');
                chip.className = 'attachment-chip';
                chip.innerHTML = `
                    <span class="attachment-chip-icon">[WAIT]</span>
                `;

                this.chipsContainer.appendChild(chip);
                this.chipsContainer.classList.add('has-items');
            }
        };

        return instance.init();
    },
};
