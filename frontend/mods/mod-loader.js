/**
 * MOD Loader - Loads all MODs from manifest, merges i18n, creates DOM
 * =================================================================
 * Responsibilities:
 * 1. Import all MODs from mod-manifest.js
 * 2. For each MOD: fetch locale JSON, merge into i18n, call init()
 * 3. Create feature buttons and shelf panels in the DOM
 * 4. Export query API: getMod(), getAllMods(), getModsByGroup()
 * =================================================================
 */

import * as manifest from './mod-manifest.js';
import { mergeStrings, getActiveLocale, t } from '../javascript/i18n.js';
import { ModState } from '../javascript/mod-state.js';

const _mods = {};

/**
 * Load all MODs from the manifest.
 * Called once on i18n:ready.
 */
export async function loadAllMods() {
    const modDefs = Object.values(manifest);

    // 1. Register all MODs in ModState first (so isEnabled works during init)
    for (const mod of modDefs) {
        ModState.registerMod(mod.id, mod);
        _mods[mod.id] = mod;
    }

    // 2. Load locale files and merge into i18n
    const locale = getActiveLocale();
    await Promise.allSettled(modDefs.map(mod => loadModLocale(mod, locale)));

    // 3. Create DOM elements (buttons + shelves) for each MOD
    for (const mod of modDefs) {
        createModDOM(mod);
    }

    // 4. Call init() on each MOD
    for (const mod of modDefs) {
        try {
            if (typeof mod.init === 'function') {
                await mod.init({ getMod, getAllMods });
            }
        } catch (e) {
            console.error(`[mod-loader] init failed for ${mod.id}:`, e);
        }
    }

    // 5. Notify feature-shelf to pick up new buttons
    window.dispatchEvent(new CustomEvent('mods:loaded'));
}

/**
 * Fetch and merge a MOD's locale file.
 * Falls back: locale → en → default → skip.
 */
async function loadModLocale(mod, locale) {
    const basePath = `/mods/${mod.id}/locales`;
    const candidates = [locale, 'en', 'default'].filter((v, i, a) => a.indexOf(v) === i);

    for (const candidate of candidates) {
        try {
            const res = await fetch(`${basePath}/${candidate}.json`);
            if (!res.ok) continue;
            const partial = await res.json();
            mergeStrings(partial);
            return;
        } catch { /* try next */ }
    }
}

/**
 * Create feature buttons and shelf panel for a MOD.
 */
function createModDOM(mod) {
    const btnContainer = document.querySelector('.feature-container');
    const shelfContainer = document.querySelector('.feature-shelf-container');

    if (!btnContainer || !shelfContainer) return;

    // Create feature buttons
    if (mod.featureButtons) {
        for (const btnDef of mod.featureButtons) {
            // Skip if button already exists (e.g. from HTML)
            if (document.querySelector(`[data-feature-btn="${btnDef.id}"]`)) continue;

            const btn = document.createElement('button');
            btn.className = 'feature-btn';
            btn.dataset.featureBtn = btnDef.id;
            // No textContent — icons are rendered via CSS ::after mask-image
            // Insert before the shelf container
            btnContainer.insertBefore(btn, shelfContainer);
        }
    }

    // Create shelf panel
    if (mod.shelfPanelId) {
        if (!document.querySelector(`[data-feature-shelf="${mod.shelfPanelId}"]`)) {
            const shelf = document.createElement('div');
            shelf.className = 'feature-shelf';
            shelf.dataset.featureShelf = mod.shelfPanelId;
            shelfContainer.appendChild(shelf);
        }
    }
}

// --- Query API ---

export function getMod(id) {
    return _mods[id] ?? null;
}

export function getAllMods() {
    return Object.values(_mods);
}

export function getModsByGroup() {
    const groups = {};
    for (const mod of Object.values(_mods)) {
        const group = mod.group || 'other';
        if (!groups[group]) groups[group] = [];
        groups[group].push(mod);
    }
    return groups;
}
