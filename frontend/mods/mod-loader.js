/**
 * MOD Loader - Instance-Based Architecture
 * =================================================================
 * Responsibilities:
 * 1. Import all templates from mod-manifest.js
 * 2. Register templates in ModState, run migration, create default instances
 * 3. For each template: fetch locale JSON, merge into i18n
 * 4. Create feature buttons FROM INSTANCES (not templates)
 * 5. Create shelf panels per template (shared across instances)
 * 6. Call template.init() once per template
 * 7. Export query API: getTemplate(), getAllTemplates(), getInstances(), etc.
 * =================================================================
 */

import * as manifest from './mod-manifest.js';
import { mergeStrings, getActiveLocale, t } from '../javascript/i18n.js';
import { ModState } from '../javascript/mod-state.js';
import { createInitContext } from '../javascript/mod-context.js';
import { ModHooks } from '../javascript/mod-hooks.js';
import { ModTools } from '../javascript/mod-tools.js';

const _templates = {};

/**
 * Load all MODs from the manifest.
 * Called once on i18n:ready.
 */
export async function loadAllMods() {
    try {
        const templateDefs = Object.values(manifest);

        // 1. Register all templates in ModState
        for (const tpl of templateDefs) {
            ModState.registerTemplate(tpl.id, tpl);
            _templates[tpl.id] = tpl;
        }

        // 2. Run migration (v1 → v2 → v3) then ensure default instances
        ModState.migrateV2ToV3();
        for (const tpl of templateDefs) {
            ModState.ensureDefaultInstances(tpl.id);
        }

        // 3. Load locale files and merge into i18n
        const locale = getActiveLocale();
        await Promise.allSettled(templateDefs.map(tpl => loadModLocale(tpl, locale)));

        // 4. Create DOM elements (buttons from instances + shelves from templates)
        createAllInstanceDOM();

        // 5. Register declarative hooks and tools from templates
        for (const tpl of templateDefs) {
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
        }

        // 6. Call init() on each template once — pass full ModContext
        for (const tpl of templateDefs) {
            try {
                if (typeof tpl.init === 'function') {
                    const initCtx = createInitContext(tpl.id, tpl);
                    await tpl.init(initCtx);
                }
            } catch (e) {
                console.error(`[mod-loader] init failed for ${tpl.id}:`, e);
            }
        }
    } catch (e) {
        console.error('[mod-loader] loadAllMods failed:', e);
    }

    // Always notify — even on partial failure
    window.dispatchEvent(new CustomEvent('mods:loaded'));
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
 */
function createInstanceButton(instance, btnContainer, shelfContainer) {
    const template = _templates[instance.templateId];
    if (!template || typeof template.getButtonDataId !== 'function') return;

    const btnId = template.getButtonDataId(instance.config);

    // Skip if button already exists with same instance ID
    if (document.querySelector(`[data-instance-id="${instance.instanceId}"]`)) return;

    const btn = document.createElement('button');
    btn.className = 'feature-btn';
    btn.dataset.featureBtn = btnId;
    btn.dataset.instanceId = instance.instanceId;
    // No textContent — icons are rendered via CSS ::after mask-image

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
    const btn = document.querySelector(`[data-instance-id="${instanceId}"]`);
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
}

/**
 * Update a single instance button's data-feature-btn (e.g. after config change).
 */
export function updateInstanceButton(instanceId) {
    const inst = ModState.getInstance(instanceId);
    if (!inst) return;
    const template = _templates[inst.templateId];
    if (!template || typeof template.getButtonDataId !== 'function') return;

    const btn = document.querySelector(`[data-instance-id="${instanceId}"]`);
    if (btn) {
        btn.dataset.featureBtn = template.getButtonDataId(inst.config);
    }
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
