/**
 * File Service
 * =================================================================
 * Handles file API interactions and client-side hashing.
 * =================================================================
 */

import { T } from '../timing.js';

export const FileService = {
    /**
     * Compute SHA-256 hash of a File or Blob.
     * @param {Blob} blob
     * @returns {Promise<string>} Hex string of the hash.
     */
    async computeHash(blob) {
        const buffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    /**
     * Check if a file exists on the server.
     * @param {string} hash
     * @returns {Promise<boolean>}
     */
    async exists(hash) {
        try {
            const response = await fetch(`/api/files/${hash}/exists`);
            if (!response.ok) return false;
            const data = await response.json();
            return data.exists;
        } catch (e) {
            console.warn('File existence check failed:', e);
            return false;
        }
    },

    /**
     * Upload a file to the server.
     * @param {File|Blob} file
     * @returns {Promise<Object>} Metadata { hash, name, mime, size }
     */
    async upload(file) {
        const formData = new FormData();
        formData.append('file', file);

        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        const headers = { 'Accept': 'application/json' };
        if (csrfToken) {
            headers['X-CSRF-TOKEN'] = csrfToken;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), T('frontend.timeout.fileUpload'));

        try {
            const response = await fetch('/api/files', {
                method: 'POST',
                body: formData,
                headers,
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            return await response.json();
        } catch (e) {
            if (e.name === 'AbortError') throw new Error('Upload timed out');
            throw e;
        } finally {
            clearTimeout(timeoutId);
        }
    },

    /**
     * Download a file from the server.
     * @param {string} hash
     * @returns {Promise<Blob>}
     */
    async download(hash) {
        const response = await fetch(`/api/files/${hash}`);
        if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText}`);
        }
        return await response.blob();
    },

    /**
     * Get file metadata from the server.
     * @param {string} hash
     * @returns {Promise<Object>} { hash, name, mime, size, status }
     */
    async meta(hash) {
        const response = await fetch(`/api/files/${hash}/meta`);
        if (!response.ok) {
            throw new Error(`Meta fetch failed: ${response.statusText}`);
        }
        return await response.json();
    },

    /**
     * Get the direct download URL (for opening in new tab).
     * @param {string} hash
     */
    downloadUrl(hash) {
        return `/api/files/${hash}`;
    }
};
