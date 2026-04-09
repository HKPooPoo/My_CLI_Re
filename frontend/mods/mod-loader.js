/**
 * MOD Loader - Dynamic Folder-Based Discovery (Lazy Code Loading)
 * =================================================================
 * Responsibilities:
 * 1. Discover MOD folders via Nginx autoindex JSON (/mods/)
 * 2. Phase 1 (ALL folders): fetch manifest.json, validate, register in ModState
 * 3. Phase 1.5: wire context factory, run migration, init shared config, load locales
 * 4. Phase 2 (ACTIVE only): import() mod.js for templates with instances
 * 5. Create feature buttons FROM INSTANCES (not templates)
 * 6. Create shelf panels per template (shared across instances)
 * 7. Call template.init() only for code-loaded templates
 * 8. Export ensureCodeLoaded() for on-demand lazy loading
 * 9. Export query API: getTemplate(), getAllTemplates(), getInstances(), etc.
 * =================================================================
 */

import { mergeStrings, getActiveLocale, t } from '../javascript/i18n.js';
import { ModState, setContextFactory } from '../javascript/mod-state.js';
import { createInitContext, createModContext, setQueryProvider } from '../javascript/mod-context.js';
import { ModHooks } from '../javascript/mod-hooks.js';
import { ModTools } from '../javascript/mod-tools.js';
import { BBMessage } from '../javascript/blackboard-msg.js';
import { MOD_API_VERSION } from '../javascript/version.js';

const _templates = {};
const _codeLoaded = new Set();
let _modsReady = false;

// Re-merge MOD locales whenever the user switches language.
// initI18n() replaces _strings entirely, wiping MOD keys merged during boot.
// Guard: skip the initial i18n:ready (which triggers loadAllMods itself).
window.addEventListener('i18n:ready', async () => {
    if (!_modsReady) return;
    const locale = getActiveLocale();
    const tpls = Object.values(_templates);
    await Promise.allSettled(tpls.map(tpl => loadModLocale(tpl, locale)));
});

// ===================== Discovery =====================

/**
 * Discover MOD folders via Nginx autoindex JSON.
 * Returns array of folder names (excluding _ prefixed and files).
 * Retries once after 2s on failure to handle startup race conditions.
 */
async function discoverModFolders() {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch('/mods/');
            if (!res.ok) throw new Error(`autoindex ${res.status}`);
            const entries = await res.json();
            const folders = entries
                .filter(e => e.type === 'directory' && !e.name.startsWith('_'))
                .map(e => e.name);
            if (folders.length > 0) return folders;
            // Empty response — likely server not ready, retry
            if (attempt === 0) {
                console.warn('[mod-loader] Discovery returned 0 folders, retrying in 2s...');
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (e) {
            if (attempt === 0) {
                console.warn('[mod-loader] Discovery failed, retrying in 2s...', e);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                throw new Error(`MOD discovery failed after 2 attempts: ${e.message}`);
            }
        }
    }
    return [];
}

// ===================== Manifest Loading =====================

/**
 * Fetch manifest.json only from a MOD folder.
 * Returns parsed manifest data, or null on failure.
 */
async function loadManifest(folderName) {
    const manifestRes = await fetch(`/mods/${folderName}/manifest.json`);
    if (!manifestRes.ok) {
        console.warn(`[mod-loader] ${folderName}/manifest.json not found (${manifestRes.status}), skipping`);
        return null;
    }

    let manifestData;
    try {
        manifestData = await manifestRes.json();
    } catch (e) {
        console.warn(`[mod-loader] ${folderName}/manifest.json invalid JSON, skipping:`, e);
        return null;
    }

    // Validate: manifest.id must match folder name
    if (manifestData.id !== folderName) {
        console.warn(`[mod-loader] ${folderName}/manifest.json id "${manifestData.id}" does not match folder name, skipping`);
        return null;
    }

    return manifestData;
}

// ===================== Code Loading =====================

/**
 * Import mod.js and merge code INTO the existing template object in-place.
 * Returns true on success, false on failure.
 */
async function loadModCode(templateId) {
    let modCode;
    try {
        const module = await import(`/mods/${templateId}/mod.js`);
        modCode = module.default || module;
    } catch (e) {
        console.warn(`[mod-loader] ${templateId}/mod.js import failed:`, e);
        return false;
    }

    // Merge code into existing manifest-only template object (in-place mutation)
    // ModState's reference to the same object updates automatically
    Object.assign(_templates[templateId], modCode);

    // Re-pin id from manifest to prevent code from overwriting it
    _templates[templateId].id = templateId;

    return true;
}

/**
 * Ensure a template's code (mod.js) is loaded, validated, and initialized.
 * Idempotent — safe to call multiple times; subsequent calls return immediately.
 * Used both at boot (for templates with instances) and on-demand (first ADD).
 */
export async function ensureCodeLoaded(templateId) {
    if (_codeLoaded.has(templateId)) return true;
    if (!_templates[templateId]) return false;

    const success = await loadModCode(templateId);
    if (!success) return false;

    // Validate full template (manifest + code)
    const errors = validateTemplate(_templates[templateId]);
    if (errors.length > 0) {
        console.warn(`[mod-loader] Full validation failed for "${templateId}":`, errors);
        return false;
    }

    _codeLoaded.add(templateId);

    const tpl = _templates[templateId];

    // Register declarative hooks (template.hooks[])
    if (Array.isArray(tpl.hooks)) {
        for (const hook of tpl.hooks) {
            ModHooks.register(hook.name, hook.handler, hook.priority || 100, tpl.id);
        }
    }

    // Register declarative tools (template.tools[])
    if (Array.isArray(tpl.tools)) {
        for (const tool of tpl.tools) {
            ModTools.register(tpl.id, tool);
        }
    }

    // Call init() once
    try {
        if (typeof tpl.init === 'function') {
            const initCtx = createInitContext(tpl.id, tpl);
            await tpl.init(initCtx);
        }
    } catch (e) {
        console.error(`[mod-loader] init failed for ${tpl.id}:`, e);
    }

    return true;
}

// ===================== Boot =====================

/**
 * Load all MODs via dynamic discovery (two-phase).
 * Called once on i18n:ready.
 *
 * Phase 1:  Manifest discovery — fetch manifest.json for ALL folders,
 *           validate manifest fields, register in ModState.
 * Phase 1.5: Framework setup — wire context factory, run migration,
 *           init shared config defaults, load MOD locales.
 * Phase 2:  Code loading — import() mod.js ONLY for templates with instances,
 *           validate full template, register hooks/tools, call init().
 */
export async function loadAllMods() {
    // Inject query functions into ModContext (breaks circular dependency)
    setQueryProvider({ getTemplate, getAllTemplates, getInstances, getInstancesByTemplate });

    try {
        // ── Phase 1: Manifest Discovery (ALL folders) ──
        const folders = await discoverModFolders();
        const results = await Promise.allSettled(folders.map(loadManifest));

        // Log any rejected promises
        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.warn(`[mod-loader] Failed to load manifest for "${folders[i]}":`, r.reason);
            }
        });

        const manifests = results
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value);

        // Validate manifest fields and register in ModState
        const registeredIds = [];
        for (const tpl of manifests) {
            const errors = validateManifest(tpl);
            if (errors.length > 0) {
                console.warn(`[mod-loader] Manifest validation failed for "${tpl.id || '(unknown)'}":`, errors);
                BBMessage.error(t('mods.validationFailed', { id: tpl.id || '(unknown)' }));
                continue;
            }

            // Check API version compatibility
            if (tpl.minApiVersion && tpl.minApiVersion > MOD_API_VERSION) {
                console.warn(`[mod-loader] Template "${tpl.id}" requires API v${tpl.minApiVersion}, current is v${MOD_API_VERSION}. Some features may not work.`);
            }

            ModState.registerTemplate(tpl.id, tpl);
            _templates[tpl.id] = tpl;
            registeredIds.push(tpl.id);
        }

        // ── Phase 1.5: Framework Setup (manifest-only) ──

        // Wire context factory for onConfigChange lifecycle
        setContextFactory(createModContext);

        // Initialize shared config defaults for groups with sharedConfigSchema
        const seenGroups = new Set();
        for (const id of registeredIds) {
            const tpl = _templates[id];
            if (tpl.sharedConfigSchema && !seenGroups.has(tpl.group)) {
                seenGroups.add(tpl.group);
                ModState.initSharedDefaults(tpl.group, tpl.sharedConfigSchema);
            }
        }

        // Run migration (v1 → v2 → v3) only — no auto-creation.
        // Users ADD mods manually from the catalog; localStorage remembers.
        ModState.migrateV2ToV3();

        // Load locale files and merge into i18n (needs manifest.id only)
        const locale = getActiveLocale();
        await Promise.allSettled(registeredIds.map(id => loadModLocale(_templates[id], locale)));

        // ── Phase 2: Code Loading (ONLY templates with instances) ──

        const activeTemplateIds = [...new Set(
            ModState.getInstances().map(inst => inst.templateId)
        )];

        const codeResults = await Promise.allSettled(activeTemplateIds.map(id => ensureCodeLoaded(id)));

        // Report failed MODs to user (not just console)
        const failedMods = activeTemplateIds.filter((id, i) => {
            const r = codeResults[i];
            return r.status === 'rejected' || (r.status === 'fulfilled' && !r.value);
        });
        if (failedMods.length > 0) {
            console.error('[mod-loader] Failed to load code for:', failedMods);
            BBMessage.error(t('mods.loadFailed', { ids: failedMods.join(', ') }));
        }

        // Create DOM elements (buttons from instances + shelves from templates)
        // Runs after code loaded, so getButtonDataId etc. are available
        createAllInstanceDOM();

    } catch (e) {
        console.error('[mod-loader] loadAllMods failed:', e);
    }

    // Always notify — even on partial failure
    window.dispatchEvent(new CustomEvent('mods:loaded'));
    _modsReady = true;
}

/**
 * Re-scan for NEW MOD folders and register their templates.
 * Existing templates are left untouched (avoids breaking active instances).
 * Returns the count of newly discovered templates.
 */
export async function rescanTemplates() {
    const folders = await discoverModFolders();
    const newFolders = folders.filter(f => !_templates[f]);
    if (newFolders.length === 0) return 0;

    const results = await Promise.allSettled(newFolders.map(loadManifest));
    const manifests = results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);

    let count = 0;
    for (const tpl of manifests) {
        const errors = validateManifest(tpl);
        if (errors.length > 0) {
            console.warn(`[mod-loader] Rescan: manifest validation failed for "${tpl.id}":`, errors);
            continue;
        }
        ModState.registerTemplate(tpl.id, tpl);
        _templates[tpl.id] = tpl;
        count++;
    }

    // Load locales for new templates
    if (count > 0) {
        const locale = getActiveLocale();
        await Promise.allSettled(manifests
            .filter(tpl => _templates[tpl.id])
            .map(tpl => loadModLocale(tpl, locale)));
    }

    return count;
}

/**
 * Fetch and merge a template's locale file.
 * Falls back: locale → en → default → skip.
 */
async function loadModLocale(tpl, locale) {
    const basePath = `/mods/${tpl.id}/locales`;
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
 * Create all instance buttons and template shelf panels.
 */
function createAllInstanceDOM() {
    const btnContainer = document.querySelector('.feature-container');
    const shelfContainer = document.querySelector('.feature-shelf-container');
    if (!btnContainer || !shelfContainer) return;

    const instances = ModState.getInstances();

    // Create feature buttons from instances (ordered)
    for (const inst of instances) {
        createInstanceButton(inst, btnContainer, shelfContainer);
    }

    // Create shelf panels from templates (one per template)
    for (const tpl of Object.values(_templates)) {
        if (tpl.shelfPanelId) {
            if (!document.querySelector(`[data-feature-shelf="${tpl.shelfPanelId}"]`)) {
                const shelf = document.createElement('div');
                shelf.className = 'feature-shelf';
                shelf.dataset.featureShelf = tpl.shelfPanelId;
                shelfContainer.appendChild(shelf);
            }
        }
    }
}

/**
 * Create a feature button for an instance.
 * Visibility is managed exclusively by feature-shelf.js updateFeatureButtons().
 */
function createInstanceButton(instance, btnContainer, shelfContainer) {
    const template = _templates[instance.templateId];
    if (!template || typeof template.getButtonDataId !== 'function') return;

    // Theme/screensaver/decoration MODs operate via events and config, not feature buttons
    if (['theme', 'screensaver', 'decoration'].includes(template.group)) return;

    const btnId = template.getButtonDataId(instance.config);

    // Skip if button already exists — scoped to .feature-container to avoid
    // collision with .mods-list-item elements that also carry data-instance-id
    if (btnContainer.querySelector(`[data-instance-id="${instance.instanceId}"]`)) return;

    const btn = document.createElement('button');
    btn.className = 'feature-btn';
    btn.dataset.featureBtn = btnId;
    btn.dataset.instanceId = instance.instanceId;
    if (template.buttonHintKey) btn.dataset.hint = template.buttonHintKey;
    // Accessibility: set aria-label from instance name
    if (typeof template.getInstanceName === 'function') {
        btn.setAttribute('aria-label', template.getInstanceName(instance.config, t));
    }
    // No textContent — icons are rendered via CSS ::after mask-image

    // Runtime icon injection — templates that provide getIconUrl() get inline CSS var
    if (typeof template.getIconUrl === 'function') {
        const url = template.getIconUrl(instance.config);
        if (url) btn.style.setProperty('--mod-icon-url', `url('${url}')`);
    }

    // Insert before the shelf container
    if (!shelfContainer) shelfContainer = document.querySelector('.feature-shelf-container');
    if (btnContainer && shelfContainer) {
        btnContainer.insertBefore(btn, shelfContainer);
    }
}

/**
 * Remove a feature button by instance ID.
 */
export function removeInstanceButton(instanceId) {
    const btnContainer = document.querySelector('.feature-container');
    const btn = btnContainer?.querySelector(`[data-instance-id="${instanceId}"]`);
    if (btn) btn.remove();
}

/**
 * Rebuild all instance buttons in order. Called after reorder/add/remove.
 */
export function rebuildInstanceButtons() {
    const btnContainer = document.querySelector('.feature-container');
    const shelfContainer = document.querySelector('.feature-shelf-container');
    if (!btnContainer || !shelfContainer) return;

    // Remove all existing instance buttons
    btnContainer.querySelectorAll('[data-instance-id]').forEach(btn => btn.remove());

    // Re-create in order
    const instances = ModState.getInstances();
    for (const inst of instances) {
        createInstanceButton(inst, btnContainer, shelfContainer);
    }

    // Notify feature-shelf to re-evaluate button visibility after DOM rebuild
    window.dispatchEvent(new CustomEvent('mods:buttonsRebuilt'));
}

/**
 * Update a single instance button's data-feature-btn (e.g. after config change).
 */
export function updateInstanceButton(instanceId) {
    const inst = ModState.getInstance(instanceId);
    if (!inst) return;
    const template = _templates[inst.templateId];
    if (!template || typeof template.getButtonDataId !== 'function') return;

    const btnContainer = document.querySelector('.feature-container');
    const btn = btnContainer?.querySelector(`[data-instance-id="${instanceId}"]`);
    if (btn) {
        btn.dataset.featureBtn = template.getButtonDataId(inst.config);
        // Refresh runtime icon
        if (typeof template.getIconUrl === 'function') {
            const url = template.getIconUrl(inst.config);
            if (url) {
                btn.style.setProperty('--mod-icon-url', `url('${url}')`);
            } else {
                btn.style.removeProperty('--mod-icon-url');
            }
        }
    }
}

// --- Template Validation ---

/**
 * Lightweight manifest-only validation.
 * Checks only data fields available from manifest.json.
 */
function validateManifest(tpl) {
    const errors = [];
    if (!tpl.id)                              errors.push('missing "id"');
    if (!tpl.group)                           errors.push('missing "group"');
    if (!tpl.nameKey)                         errors.push('missing "nameKey"');
    if (!Array.isArray(tpl.defaultInstances)) errors.push('missing defaultInstances[]');
    return errors;
}

/**
 * Full template validation (manifest + code).
 * Called by ensureCodeLoaded() after mod.js merge.
 */
function validateTemplate(tpl) {
    const errors = [];
    if (!tpl.id)                                    errors.push('missing "id"');
    if (!tpl.group)                                 errors.push('missing "group"');
    if (!tpl.nameKey)                               errors.push('missing "nameKey"');
    if (typeof tpl.getButtonDataId !== 'function')  errors.push('missing getButtonDataId()');
    if (typeof tpl.getInstanceName !== 'function')  errors.push('missing getInstanceName()');
    if (!Array.isArray(tpl.defaultInstances))        errors.push('missing defaultInstances[]');
    if (typeof tpl.init !== 'function')             errors.push('missing init()');
    if (typeof tpl.activate !== 'function')         errors.push('missing activate()');
    return errors;
}

// --- Query API ---

export function getTemplate(id) {
    return _templates[id] ?? null;
}

export function getAllTemplates() {
    return Object.values(_templates);
}

export function getInstances() {
    return ModState.getInstances();
}

export function getInstancesByTemplate(templateId) {
    return ModState.getInstancesByTemplate(templateId);
}
