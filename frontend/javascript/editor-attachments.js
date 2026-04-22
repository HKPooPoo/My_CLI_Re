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
import { T } from './timing.js';
import { RECORD_MAX_FILES } from './settings.js';

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

// Extension whitelist now lives in FileService.isAllowedExtension().
// Old blacklist removed — see file-service.js for the allowed set.
// const BLOCKED_EXTENSIONS = new Set([
//     'php', 'phtml', 'phar', 'exe', 'bat', 'cmd', 'sh',
//     'html', 'htm', 'xhtml', 'cgi', 'pl'
// ]);

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
     * @param {Function} [config.onRename] - Callback when file is renamed (oldHash, newHash, meta)
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
            onRename: config.onRename || (() => { }),

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

                // --- Drag / Paste / File Input ---
                // Always bind; runtime `this.readOnly` check inside each handler
                // so setReadOnly() can flip behaviour without rebinding.
                if (dropZone) {
                    dropZone.addEventListener('dragenter', (e) => {
                        if (this.readOnly) return;
                        e.preventDefault();
                        this._dragCounter++;
                        if (this._dragCounter === 1) {
                            this._getEl('dropOverlay')?.classList.add('active');
                        }
                    });

                    dropZone.addEventListener('dragover', (e) => {
                        if (this.readOnly) return;
                        e.preventDefault();
                    });

                    dropZone.addEventListener('dragleave', (e) => {
                        if (this.readOnly) return;
                        e.preventDefault();
                        this._dragCounter--;
                        if (this._dragCounter <= 0) {
                            this._dragCounter = 0;
                            this._getEl('dropOverlay')?.classList.remove('active');
                        }
                    });

                    dropZone.addEventListener('drop', async (e) => {
                        if (this.readOnly) return;
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
                        if (this.readOnly) return;
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
                            if (this.readOnly) {
                                e.target.value = '';
                                return;
                            }
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
                if (chipsContainer) {
                    chipsContainer.addEventListener('click', async (e) => {
                        if (this.readOnly) return;
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
                // Tier 18: configurable maxFiles retired — hardcoded 10 per
                // record across BB / WT / BC.
                if (this.currentHashes.length >= RECORD_MAX_FILES) {
                    BBMessage.error(t('files.limitReached'));
                    return;
                }

                if (file.size > MAX_FILE_SIZE) {
                    BBMessage.error(t('files.tooLarge'));
                    return;
                }

                if (!FileService.isAllowedExtension(file.name || '')) {
                    BBMessage.error(t('files.unsupportedType'));
                    return;
                }

                // If the user removed a file via the chip button and immediately dragged
                // a new one, onDetach may still be in-flight (DB: bin → null).
                if (this._detachPromise) {
                    await this._detachPromise;
                }

                // Skip duplicate: if this hash is already attached, ignore.
                // Hash includes filename, so renaming a file yields a new hash.
                const preHash = await FileService.computeHash(file, file.name);
                if (this.currentHashes.includes(preHash)) {
                    BBMessage.error(t('files.duplicateInRecord'));
                    return;
                }

                this._appendLoadingChip();

                try {
                    const hash = preHash;

                    try {
                        // Preserve existing status + metadata if this exact
                        // (content+name) blob was already attached from another
                        // record — possibly already [SYNC]. A blind put() with
                        // status:'local' would regress the chip to [LOCAL] even
                        // though the server has the blob, and future commits
                        // would skip the upload (exists=true) without fixing
                        // the stale status. Mirrors the _renameFile() guard at
                        // line 733-746.
                        const existing = await db.file_blobs.get(hash);
                        if (existing) {
                            await db.file_blobs.update(hash, { last_accessed: Date.now() });
                        } else {
                            await db.file_blobs.put({
                                hash: hash,
                                blob: file,
                                name: file.name,
                                type: file.type,
                                size: file.size,
                                status: 'local',
                                last_accessed: Date.now()
                            });
                        }
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
                        // CLOUD chip: render immediately with hint name (from record),
                        // then lazy-fetch server meta for authoritative name if no hint.
                        const hintName = (hint && hint.hash === hash) ? hint.name : null;
                        this._appendChip({ hash, status: 'cloud', name: hintName });
                        if (!hintName) {
                            FileService.meta(hash).then(meta => {
                                if (version !== this._srVersion || !meta?.name) return;
                                const chip = this._findChip(hash);
                                if (!chip) return;
                                chip.dataset.name = meta.name;
                                const nameEl = chip.querySelector('.attachment-chip-name');
                                if (nameEl) {
                                    if (nameEl.tagName === 'INPUT') nameEl.value = meta.name;
                                    else nameEl.textContent = meta.name;
                                    nameEl.title = meta.name;
                                }
                            }).catch(() => { /* keep hash fallback */ });
                        }
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
             * Toggle the editable/readonly mode at runtime. Used by hosts whose
             * permission changes between record selections (e.g. BC switching
             * between owner and reader channels on the same attachment
             * instance). Updates existing chips in place and ensures future
             * `_appendChip` renders pick up the new value.
             *
             * Note: dropzone / file-input / remove-delegate listeners are now
             * always bound at init() and gated on `this.readOnly` at runtime,
             * so this method doesn't need to rebind them.
             */
            setReadOnly(value) {
                const next = !!value;
                if (this.readOnly === next) return;
                this.readOnly = next;

                const container = this._getEl('chipsContainer');
                if (!container) return;

                container.querySelectorAll('.attachment-chip').forEach(chip => {
                    const removeBtn = chip.querySelector('.attachment-chip-remove');
                    if (removeBtn) {
                        removeBtn.style.display = this.readOnly ? 'none' : '';
                    }
                    const nameInput = chip.querySelector('input.attachment-chip-name');
                    if (nameInput) {
                        if (this.readOnly) {
                            nameInput.setAttribute('readonly', 'true');
                        } else if (!chip.classList.contains('is-cloud')) {
                            // Cloud chips stay readonly (separate concern: name
                            // editing requires the blob to be on this device).
                            nameInput.removeAttribute('readonly');
                        }
                    }
                });
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
                setTimeout(() => URL.revokeObjectURL(url), T('frontend.timeout.blobUrlRevoke'));
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
                        chip.classList.remove('is-cloud');
                        chip.classList.add('is-synced');
                        const icon = chip.querySelector('.attachment-chip-icon');
                        if (icon) icon.textContent = t('files.statusSync');
                        const nameEl = chip.querySelector('.attachment-chip-name');
                        if (nameEl) {
                            nameEl.removeAttribute('readonly');
                            if (meta.name) {
                                if (nameEl.tagName === 'INPUT') nameEl.value = meta.name;
                                else nameEl.textContent = meta.name;
                                nameEl.title = meta.name;
                                chip.dataset.name = meta.name;
                            }
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
             * Open LOCAL-only chip (blob not on server yet) in a new tab.
             *
             * Called from the chip-icon click handler AFTER preventDefault on
             * the anchor. Pre-opens a blank tab synchronously so the user
             * gesture is preserved across the subsequent await — otherwise
             * popup blockers demote window.open to same-tab navigation.
             *
             * SYNCED/CLOUD chips use the anchor's native target="_blank" so
             * they never reach this path.
             */
            async _openLocalInNewTab(hash) {
                const win = window.open('', '_blank');
                if (!win) {
                    BBMessage.error(t('files.openBlocked'));
                    return;
                }
                const file = await this._ensureLocal(hash);
                if (!file) { win.close(); return; }
                const url = URL.createObjectURL(file.blob);
                win.location = url;
                setTimeout(() => URL.revokeObjectURL(url), T('frontend.timeout.blobUrlRevokeOffline'));
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
                chip.dataset.name = name || '';

                let iconText;
                if (status === 'local') {
                    iconText = t('files.statusLocal');
                    chip.classList.add('is-local');
                } else if (status === 'synced') {
                    iconText = t('files.statusSync');
                    chip.classList.add('is-synced');
                } else {
                    iconText = t('files.statusCloud');
                    chip.classList.add('is-cloud');
                }

                const removeHtml = this.readOnly ? '' :
                    `<button class="attachment-chip-remove" data-hash="${hash}" title="Remove">${t('files.removeBtn')}</button>`;

                const displayName = name || hash.substring(0, 8) + '…';
                // CLOUD chips: name is readonly until the blob is on this device.
                // Renaming needs the blob (we hash content + new name locally), so we
                // force the user to promote CLOUD → SYNC first by clicking the icon.
                const readonlyAttr = status === 'cloud' ? ' readonly' : '';
                const nameInputHtml = this.readOnly
                    ? `<span class="attachment-chip-name"></span>`
                    : `<input class="attachment-chip-name" type="text" spellcheck="false" autocomplete="off"${readonlyAttr} />`;

                // Icon is an anchor to the INLINE server URL (?inline=1) so
                // the browser opens it as a preview in a new tab. The separate
                // download button ([⬇]) triggers a blob Save-As. Native anchor
                // navigation avoids the popup-blocker demotion that
                // window.open suffers after async awaits.
                chip.innerHTML = `
                    <div class="attachment-chip-top">
                        ${nameInputHtml}
                        <span class="attachment-chip-download" data-hash="${hash}">${t('files.downloadBtn')}</span>
                    </div>
                    <div class="attachment-chip-bottom">
                        <a class="attachment-chip-icon" href="${FileService.viewUrl(hash)}" target="_blank" rel="noopener" data-hint="hints.chipStatus">${iconText}</a>
                        ${removeHtml}
                    </div>
                `;

                const nameEl = chip.querySelector('.attachment-chip-name');
                if (this.readOnly) {
                    nameEl.textContent = displayName;
                } else {
                    nameEl.value = displayName;
                    nameEl.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
                        else if (e.key === 'Escape') { nameEl.value = chip.dataset.name || displayName; nameEl.blur(); }
                    });
                    nameEl.addEventListener('change', async () => {
                        const proposed = nameEl.value.trim();
                        const prev = chip.dataset.name || displayName;
                        if (!proposed) {
                            nameEl.value = prev;
                            BBMessage.error(t('common.nameEmpty'));
                            return;
                        }
                        if (proposed === prev) {
                            nameEl.value = prev;
                            return;
                        }
                        const ok = await this._renameFile(chip.dataset.hash, proposed);
                        if (!ok) nameEl.value = prev;
                    });
                }
                nameEl.title = name || hash;

                chip.querySelector('.attachment-chip-download').addEventListener('click', () => {
                    this.downloadFile(chip.dataset.hash);
                });

                chip.querySelector('.attachment-chip-icon').addEventListener('click', (e) => {
                    // Keep anchor href in sync with current hash (rename updates dataset.hash)
                    e.currentTarget.setAttribute('href', FileService.viewUrl(chip.dataset.hash));
                    const isSynced = chip.classList.contains('is-synced');
                    const isLocalOnly = chip.classList.contains('is-local') && !isSynced;
                    const isCloud = chip.classList.contains('is-cloud');
                    if (isLocalOnly) {
                        // [LOCAL]: server has nothing yet, so use the local
                        // blob as the preview source. preventDefault + pre-open
                        // blank tab synchronously to keep the user gesture
                        // before any await, then navigate to blob URL.
                        e.preventDefault();
                        this._openLocalInNewTab(chip.dataset.hash);
                    } else if (isCloud) {
                        // [CLOUD]: single-click "server → IDB → browser".
                        // Pre-open a blank tab synchronously (popup-blocker
                        // gesture), await _ensureLocal to pull the blob into
                        // file_blobs (chip promotes to [SYNC] in place), then
                        // navigate the pre-opened tab to the server inline URL
                        // for preview. Previously (ed2d0c1) this was a
                        // two-click flow — download first, click again to
                        // preview — which broke the "one click = preview"
                        // contract that the [LOCAL]/[SYNC] paths already hold.
                        e.preventDefault();
                        const win = window.open('', '_blank');
                        if (!win) {
                            BBMessage.error(t('files.openBlocked'));
                            return;
                        }
                        this._ensureLocal(chip.dataset.hash)
                            .then(file => {
                                if (!file) { win.close(); return; }
                                win.location = FileService.viewUrl(chip.dataset.hash);
                            })
                            .catch(() => { win.close(); });
                    }
                    // [SYNC]: fall through, native anchor navigation opens
                    // /api/files/{hash}?inline=1 in the new tab — inline
                    // preview served directly from the server.
                });

                container.appendChild(chip);
                container.classList.add('has-items');
            },

            /**
             * Rename a file: re-upload its blob under a new (content+name) hash.
             * The old hash in the record is swapped for the new hash via onRename
             * callback. Old server blob becomes orphan-eligible (24h cleanup);
             * local blob is kept (may still be referenced by history records).
             *
             * Returns true on success, false on failure/no-op so the UI can
             * revert the input value.
             */
            async _renameFile(oldHash, newName) {
                // Reject at the UI boundary so user sees instant toast
                // instead of a silent commit failure later.
                if (!FileService.isAllowedExtension(newName)) {
                    BBMessage.error(t('files.unsupportedType'));
                    return false;
                }

                // Ensure local blob is available (downloads if CLOUD)
                const local = await this._ensureLocal(oldHash);
                if (!local || !local.blob) {
                    BBMessage.error(t('files.renameFailed'));
                    return false;
                }

                const newHash = await FileService.computeHash(local.blob, newName);

                // Same hash means same content+name — no-op
                if (newHash === oldHash) return false;

                // Per-record uniqueness: reject if another chip already uses newHash
                if (this.currentHashes.includes(newHash)) {
                    BBMessage.error(t('files.renameDuplicate'));
                    return false;
                }

                try {
                    // If another record already introduced this exact
                    // content+name pair earlier, the blob may already exist
                    // (possibly as 'synced'). Preserve existing status +
                    // metadata so the other record's chip doesn't regress
                    // from [SYNC] back to [LOCAL] after this rename.
                    const existing = await db.file_blobs.get(newHash);
                    if (existing) {
                        await db.file_blobs.update(newHash, { last_accessed: Date.now() });
                    } else {
                        await db.file_blobs.put({
                            hash: newHash,
                            blob: local.blob,
                            name: newName,
                            type: local.blob.type,
                            size: local.blob.size,
                            status: 'local',
                            last_accessed: Date.now()
                        });
                    }
                } catch (err) {
                    if (err.name === 'QuotaExceededError') {
                        BBMessage.error(t('files.storageFull'));
                    } else {
                        BBMessage.error(t('files.renameFailed'));
                    }
                    return false;
                }

                // Swap hash in currentHashes
                const idx = this.currentHashes.indexOf(oldHash);
                if (idx !== -1) this.currentHashes[idx] = newHash;

                // Update chip DOM: hash refs, status class/icon, name cache.
                // Status reflects the ACTUAL blob state (may be 'synced' if
                // another record already had this exact content+name pair).
                const newBlob = await db.file_blobs.get(newHash);
                const newStatus = newBlob?.status || 'local';
                const chip = this._findChip(oldHash);
                if (chip) {
                    chip.dataset.hash = newHash;
                    chip.dataset.name = newName;
                    chip.classList.remove('is-local', 'is-synced');
                    const icon = chip.querySelector('.attachment-chip-icon');
                    if (newStatus === 'synced') {
                        chip.classList.add('is-synced');
                        if (icon) icon.textContent = t('files.statusSync');
                    } else {
                        chip.classList.add('is-local');
                        if (icon) icon.textContent = t('files.statusLocal');
                    }
                    if (icon) icon.setAttribute('href', FileService.viewUrl(newHash));
                    const dl = chip.querySelector('.attachment-chip-download');
                    if (dl) dl.dataset.hash = newHash;
                    const rm = chip.querySelector('.attachment-chip-remove');
                    if (rm) rm.dataset.hash = newHash;
                    const nameEl = chip.querySelector('.attachment-chip-name');
                    if (nameEl) nameEl.title = newName;
                }

                // Notify host to update its record's file_hash and trigger commit
                try {
                    await this.onRename(oldHash, newHash, {
                        name: newName,
                        size: local.blob.size,
                        mime: local.blob.type
                    });
                } catch (err) {
                    console.error('onRename host callback failed:', err);
                }

                return true;
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
