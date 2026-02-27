/**
 * _template MOD — Full Interface Skeleton (v3)
 * =================================================================
 * Copy this folder to create a new MOD. Replace all "mymod" and
 * "my-mod" references with your actual MOD ID.
 *
 * Checklist for adding a new MOD:
 * 1. Copy mods/_template/ → mods/{your-id}/
 * 2. Edit manifest.json: set id (must match folder name), group,
 *    nameKey, descriptionKey, configSchema, providers, defaultInstances
 * 3. Set pages{} in manifest.json to declare which pages this MOD
 *    appears on — OR implement getDeployPages(config) in mod.js
 * 4. Implement init() (shelf UI) and activate() (core logic) in mod.js
 * 5. Create locale files in locales/{en,zh-TW,default}.json
 * 6. Add CSS icon: .feature-btn[data-feature-btn="{btn-id}"]::after
 *    OR implement getIconUrl() for runtime icons (no CSS editing needed)
 * 7. Refresh browser — MOD appears automatically in catalog
 *
 * Data vs Code separation:
 *   manifest.json — pure data: id, group, nameKey, configSchema, etc.
 *   mod.js        — pure code: init(), activate(), getButtonDataId(), etc.
 *   At boot, mod-loader.js merges { ...manifest, ...mod } into one object.
 *
 * Shared CSS classes (mod-shared.css):
 *   .mod-scrollbar      — CRT vertical scrollbar (add to overflow-y containers)
 *   .mod-scrollbar-x    — CRT horizontal scrollbar (add to overflow-x containers)
 *   .mod-shelf-output   — shelf textarea panel (translate, LLM style)
 *   .mod-shelf-content  — shelf div panel (markdown, rich content)
 *   .mod-btn            — long CRT button (green border + hover glow)
 *   .mod-btn-danger     — red variant of .mod-btn
 *   .mod-btn-row        — horizontal flex row of buttons (equal width)
 *   .mod-btn-list       — vertical scrollable list of buttons
 *   .mod-btn-grid       — horizontal scroll grid for square buttons
 *   .mod-btn-square     — square icon button (set --mod-btn-icon for mask)
 *   .mod-chip           — small pill/chip button
 *   .mod-chip-row       — horizontal scroll row of chips
 *
 * Version guidelines:
 * - Set `version` in manifest.json to SemVer (displayed in mods-manager UI)
 * - Set `minApiVersion` in manifest.json to the minimum MOD_API_VERSION required
 *   (framework warns at boot if current API version is lower)
 *
 * Common Gotchas:
 * - SW cache: always bump CACHE_NAME in sw.js after changes, or stale
 *   cache will serve old files and your MOD won't appear.
 * - init() receives instanceId=null; activate() gets the full context.
 * - Module-level `let` state is shared across ALL instances of this
 *   template. Use ctx.storage.get/set() for per-instance state.
 * - ctx.board methods return null if no page is active (e.g. during init).
 * - onConfigChange() now receives a real ModContext (not null).
 * - manifest.json id MUST match folder name, or the MOD will be skipped.
 *
 * Yellow-zone bypasses:
 * - When the framework lacks an API you need (e.g. textarea event
 *   listeners — no record:textChanged hook yet), direct DOM access
 *   is acceptable WITH a comment:
 *     // BYPASS: reason, migrate when API X exists
 * - When the framework API is added, migrate all yellow-zone code.
 * =================================================================
 */

export default {
    // ===================== Code Methods =====================
    // Data fields (id, group, nameKey, configSchema, etc.) are in manifest.json.
    // Only functions and runtime logic go here.

    /**
     * Map instance config → button's data-feature-btn attribute value.
     * This drives the CSS ::after mask-image for the button icon.
     * @param {object} config  Instance config
     * @returns {string}
     */
    getButtonDataId(config) {
        return 'my-mod';
    },

    /**
     * Display name for this instance in the active instances list.
     * Should differentiate between instances (e.g. by config values).
     * @param {object} config  Instance config
     * @param {Function} tFn   Translation function
     * @returns {string}
     */
    getInstanceName(config, tFn) {
        return tFn('mods.myMod.name');
    },

    // ===================== LLM Tools =====================

    /**
     * Tools exposed to LLM agents and other MODs.
     * Schema follows OpenAI function-calling format.
     * Tools are registered as "{templateId}.{name}" in ModTools.
     */
    tools: [
        // {
        //     name: 'process_text',
        //     description: 'Process the given text through this MOD',
        //     parameters: {
        //         type: 'object',
        //         properties: {
        //             text: { type: 'string', description: 'Text to process' },
        //         },
        //         required: ['text']
        //     },
        //     async execute(args, ctx) {
        //         return { result: args.text.toUpperCase() };
        //     }
        // },
    ],

    // ===================== Hooks =====================

    /**
     * Declarative hook handlers. Registered during boot.
     * Hook points are instrumented in core modules.
     * Priority: lower number = runs first (default 100).
     */
    hooks: [
        // {
        //     name: 'board:beforeSave',
        //     priority: 100,
        //     handler: async (event) => {
        //         // event.data.text — the text being saved
        //         // event.cancel() — prevent the save
        //     }
        // },
    ],

    // ===================== Lifecycle =====================

    /**
     * Called ONCE per template at boot (after DOM creation).
     * Use to set up shelf UI, bind global events, cache DOM refs.
     */
    async init(ctx) {
        // Example: set up shelf panel content
        // const shelf = ctx.ui.getShelfElement();
        // if (shelf) {
        //     shelf.innerHTML = '<div id="my-mod-output"></div>';
        // }
    },

    /**
     * Called on each button click (per instance).
     */
    async activate(ctx) {
        // Example: read text, process, show result
        // const text = ctx.board.getText();
        // if (!text) {
        //     ctx.ui.toast(ctx.i18n.t('mods.myMod.empty'));
        //     return;
        // }
    },

    /**
     * Called when shelf closes or a different button is clicked.
     */
    async deactivate(ctx) {},

    /**
     * Called when any config field changes for any instance.
     */
    onConfigChange(ctx, key, value) {},

    /**
     * Health check for the active provider.
     */
    async checkHealth(instanceConfig) {
        return 'online';
    },

    /**
     * Cleanup — called on MOD unload (rare).
     */
    destroy(ctx) {},

    // ===================== Optional Methods =====================

    // getDeployPages(config) { return ['blackboard-log']; },
    // getInfoValue(key, instanceId) { return '—'; },
    // async onAction(key, instanceId) { },
    // getIconUrl(config) { return null; },
};
