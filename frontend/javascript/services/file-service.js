/**
 * File Service
 * =================================================================
 * Handles file API interactions and client-side hashing.
 *
 * Uses raw fetch() (not apiRequest) because upload needs FormData and
 * download returns Blob — both incompatible with apiRequest's JSON
 * assumptions. But we reuse the same 429 rate-limit event and timeout
 * pattern so the user experience is uniform.
 * =================================================================
 */

import { T } from '../timing.js';

let _lastRateLimitEvent = 0;

function check429(response) {
    if (response.status === 429) {
        const now = Date.now();
        if (now - _lastRateLimitEvent > T('frontend.toast.rateLimitDebounce')) {
            _lastRateLimitEvent = now;
            window.dispatchEvent(new Event('api:rateLimited'));
        }
    }
}

function makeTimeout(ms) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, clear: () => clearTimeout(id) };
}

export const FileService = {
    /**
     * Compute SHA-256 hash of content + 0x00 + filename (UTF-8).
     * Name-sensitive so renaming a file yields a new hash — matches server
     * FileService::upload() formula. Two uploads with identical content but
     * different names produce different hashes (no dedupe). Same content +
     * same name → same hash → dedupe.
     */
    async computeHash(blob, name) {
        if (!name) throw new Error('computeHash: name is required');
        const contentBuf = await blob.arrayBuffer();
        const nameBuf = new TextEncoder().encode('\0' + name);
        const combined = new Uint8Array(contentBuf.byteLength + nameBuf.byteLength);
        combined.set(new Uint8Array(contentBuf), 0);
        combined.set(nameBuf, contentBuf.byteLength);
        const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Check if a file exists on the server.
     */
    async exists(hash) {
        const timer = makeTimeout(T('frontend.timeout.apiDefault'));
        try {
            const response = await fetch(`/api/files/${hash}/exists`, { signal: timer.signal });
            check429(response);
            if (!response.ok) return false;
            const data = await response.json();
            return data.exists;
        } catch (e) {
            if (e.name === 'AbortError') console.warn('File exists check timed out');
            return false;
        } finally {
            timer.clear();
        }
    },

    /**
     * Upload a file to the server. Filename required — server hashes
     * content + name together, so the name sent must match what was used
     * for client-side computeHash(blob, name).
     */
    async upload(file, filename) {
        const name = filename || file.name;
        if (!name) throw new Error('upload: filename is required');
        const formData = new FormData();
        formData.append('file', file, name);

        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        const headers = { 'Accept': 'application/json' };
        if (csrfToken) headers['X-CSRF-TOKEN'] = csrfToken;

        const timer = makeTimeout(T('frontend.timeout.fileUpload'));
        try {
            const response = await fetch('/api/files', {
                method: 'POST',
                body: formData,
                headers,
                signal: timer.signal,
            });
            check429(response);
            if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
            return await response.json();
        } catch (e) {
            if (e.name === 'AbortError') throw new Error('Upload timed out');
            throw e;
        } finally {
            timer.clear();
        }
    },

    /**
     * Download a file from the server (returns Blob).
     */
    async download(hash) {
        const timer = makeTimeout(T('frontend.timeout.apiDefault'));
        try {
            const response = await fetch(`/api/files/${hash}`, { signal: timer.signal });
            check429(response);
            if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
            return await response.blob();
        } catch (e) {
            if (e.name === 'AbortError') throw new Error('Download timed out');
            throw e;
        } finally {
            timer.clear();
        }
    },

    /**
     * Get file metadata from the server.
     */
    async meta(hash) {
        const timer = makeTimeout(T('frontend.timeout.apiDefault'));
        try {
            const response = await fetch(`/api/files/${hash}/meta`, { signal: timer.signal });
            check429(response);
            if (!response.ok) throw new Error(`Meta fetch failed: ${response.statusText}`);
            return await response.json();
        } catch (e) {
            if (e.name === 'AbortError') throw new Error('Meta fetch timed out');
            throw e;
        } finally {
            timer.clear();
        }
    },

    /**
     * Get the direct download URL. Sends Content-Disposition: attachment.
     */
    downloadUrl(hash) {
        return `/api/files/${hash}`;
    },

    /**
     * Get the inline-preview URL (for opening in new tab). Sends
     * Content-Disposition: inline so the browser displays the file
     * natively if it can (PDF, image, text) instead of downloading it.
     */
    viewUrl(hash) {
        return `/api/files/${hash}?inline=1`;
    }
};
