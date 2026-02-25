/**
 * MOD Board Provider - Board Data Access Layer
 * =================================================================
 * Single-responsibility: provide read access to board data across
 * all 3 scopes (BB, WT, BC) via a metadata provider pattern.
 *
 * Instead of brittle DOM data-* attributes, each feature module
 * registers a callback that returns live in-memory state.
 *
 * Usage:
 *   registerMetadataProvider('bb', () => ({ branchId, branchName, ... }));
 *   const meta = getCurrentRecord('bb');
 * =================================================================
 */

import { BBCore } from './blackboard-core.js';
import { WTDb } from './walkie-typie-db.js';
import { BCDb } from './broadcast-db.js';
import db from './indexedDB.js';
import { FileService } from './services/file-service.js';

// --- Metadata providers: scope → () => metadata ---
const _metadataProviders = {};

/**
 * Register a metadata provider for a scope.
 * Called once per feature module at boot time.
 *
 * @param {'bb'|'wt'|'bc'} scope
 * @param {() => object} provider  Returns { branchId, branchName, timestamp, text, fileHash, owner, isVirtual, headIndex }
 */
export function registerMetadataProvider(scope, provider) {
    _metadataProviders[scope] = provider;
}

/**
 * Get current record metadata from the active scope's provider.
 * Returns live in-memory state — always fresh, never stale.
 *
 * @param {'bb'|'wt'|'bc'} scope
 * @returns {object|null} { branchId, branchName, timestamp, text, fileHash, owner, isVirtual, headIndex }
 */
export function getCurrentRecord(scope) {
    const provider = _metadataProviders[scope];
    if (!provider) return null;
    try {
        return provider();
    } catch (e) {
        console.error(`[mod-board-provider] getCurrentRecord(${scope}) failed:`, e);
        return null;
    }
}

/**
 * Get file attachment hashes from the active record.
 *
 * @param {'bb'|'wt'|'bc'} scope
 * @returns {string[]}  Array of file hashes
 */
export function getAttachments(scope) {
    const meta = getCurrentRecord(scope);
    if (!meta?.fileHash) return [];

    const fh = meta.fileHash;
    if (Array.isArray(fh)) {
        return fh.map(f => (typeof f === 'object') ? f.hash : f).filter(Boolean);
    }
    if (typeof fh === 'object') return fh.hash ? [fh.hash] : [];
    return fh ? [fh] : [];
}

/**
 * Get all records for a branch (history).
 *
 * @param {'bb'|'wt'|'bc'} scope
 * @param {string|number} branchId
 * @param {string} [owner]  Required for BB scope
 * @returns {Promise<object[]>}
 */
export async function getAllRecords(scope, branchId, owner) {
    try {
        switch (scope) {
            case 'bb': return await BBCore.getAllRecordsForBranch(owner || 'local', branchId);
            case 'wt': return await WTDb.getAllRecordsForBranch(branchId);
            case 'bc': return await BCDb.getAllRecords(Number(branchId));
            default:   return [];
        }
    } catch (e) {
        console.error(`[mod-board-provider] getAllRecords(${scope}) failed:`, e);
        return [];
    }
}

/**
 * Get all branches for a scope.
 *
 * @param {'bb'|'wt'|'bc'} scope
 * @param {string} [owner]  Required for BB scope
 * @returns {Promise<object[]>} Array of { id, name, ... }
 */
export async function getAllBranches(scope, owner) {
    try {
        switch (scope) {
            case 'bb': return await BBCore.getAllBranches(owner || 'local');
            case 'wt': return [];  // WT branches managed via connections
            case 'bc': return [];  // BC channels managed via broadcast-list
            default:   return [];
        }
    } catch (e) {
        console.error(`[mod-board-provider] getAllBranches(${scope}) failed:`, e);
        return [];
    }
}

// --- File cache helpers ---

/**
 * Read file content — local IndexedDB cache first, then server.
 *
 * @param {string} hash  File SHA-256 hash
 * @returns {Promise<Blob>}
 */
export async function readFileContent(hash) {
    // Try local IndexedDB cache first
    try {
        const cached = await db.file_blobs.get(hash);
        if (cached?.blob) return cached.blob;
    } catch (_) { /* cache miss */ }

    // Fall back to server
    return FileService.download(hash);
}

/**
 * Read file as text — convenience wrapper.
 *
 * @param {string} hash  File SHA-256 hash
 * @returns {Promise<string>}
 */
export async function readFileText(hash) {
    const blob = await readFileContent(hash);
    return blob.text();
}
