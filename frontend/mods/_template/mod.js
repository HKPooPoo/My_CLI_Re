/**
 * _template MOD — Full Interface Skeleton
 * =================================================================
 * Copy this folder to create a new MOD. Replace all "mymod" and
 * "my-mod" references with your actual MOD ID.
 *
 * Checklist for adding a new MOD:
 * 1. Copy mods/_template/ → mods/{your-id}/
 * 2. Update id, nameKey, descriptionKey, group
 * 3. Fill in configSchema, providers, defaultInstances
 * 4. Set pages{} to declare which pages this MOD appears on
 * 5. Implement init() (shelf UI) and activate() (core logic)
 * 6. Create locale files in locales/{en,zh-TW,default}.json
 * 7. Add export to mod-manifest.js
 * 8. Add CSS icon: .feature-btn[data-feature-btn="{btn-id}"]::after
 * 9. Bump CACHE_NAME in sw.js
 * =================================================================
 */

export default {
    // ===================== Identity =====================

    /** Unique ID — must match folder name */
    id: 'my-mod',

    /**
     * UI grouping in template catalog.
     * Values: 'linguistics' | 'utilities' | 'llm'
     */
    group: 'utilities',

    /** i18n key for display name */
    nameKey: 'mods.myMod.name',

    /** i18n key for description (shown in config page) */
    descriptionKey: 'mods.myMod.desc',

    // ===================== Metadata (NEW in v2) =====================

    /** SemVer — presence triggers v2 ModContext mode */
    version: '1.0.0',

    /** Author name (shown in config page, optional) */
    author: '',

    // ===================== Instance Architecture =====================

    /**
     * Max number of instances allowed.
     * 0 or omitted = unlimited. 1 = exactly one (cannot delete).
     * N = up to N instances.
     */
    // maxInstances: 0,

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

    /**
     * Default instances created on first run (when no localStorage data).
     * Each object has a `config` property with initial values.
     */
    defaultInstances: [
        { config: {} },
    ],

    // ===================== Feature Integration =====================

    /**
     * Shelf panel ID — shared across all instances of this template.
     * Set to null if this MOD has no shelf panel.
     */
    shelfPanelId: 'my-mod',

    /**
     * Page-to-textarea mapping AND button visibility declaration.
     * Keys are page IDs (data-page values). The button only appears
     * on pages listed here. Values specify which textarea to bind.
     * Empty object or omitted → button appears on all pages.
     */
    pages: {
        'blackboard-log':    { textareaSelector: '#log-textarea' },
        'broadcast-channel': { textareaSelector: '#channel-textarea' },
    },

    // ===================== Providers =====================

    /**
     * Available providers. Each has an id, type, and optional health endpoint.
     * Types: 'cloud' (external API), 'server' (local Docker), 'client' (browser)
     */
    providers: [
        { id: 'default', type: 'client', nameKey: 'mods.myMod.provider.default' },
    ],

    // ===================== Config Schema =====================

    /**
     * Config fields rendered in the MOD config page.
     * Supported types: select, text, range, toggle, info, action
     *
     * Each field supports:
     *   key       — config key name
     *   type      — field type
     *   labelKey  — i18n key for the label
     *   default   — default value (used when creating new instances)
     *   showWhen  — { key, value } — only show when another field matches
     */
    configSchema: [
        // Example: select field
        // {
        //     key: 'mode',
        //     type: 'select',
        //     labelKey: 'mods.myMod.config.mode',
        //     options: [
        //         { value: 'auto', labelKey: 'mods.myMod.mode.auto' },
        //         { value: 'manual', labelKey: 'mods.myMod.mode.manual' },
        //     ],
        //     default: 'auto'
        // },

        // Example: text field
        // {
        //     key: 'apiKey',
        //     type: 'text',
        //     labelKey: 'mods.myMod.config.apiKey',
        //     default: ''
        // },

        // Example: range field
        // {
        //     key: 'intensity',
        //     type: 'range',
        //     labelKey: 'mods.myMod.config.intensity',
        //     min: 0, max: 100, step: 1,
        //     default: 50
        // },

        // Example: toggle field
        // {
        //     key: 'autoRun',
        //     type: 'toggle',
        //     labelKey: 'mods.myMod.config.autoRun',
        //     default: false
        // },

        // Example: info field (read-only display)
        // {
        //     key: 'serverStatus',
        //     type: 'info',
        //     labelKey: 'mods.myMod.config.status',
        //     showWhen: { key: 'provider', value: 'server' }
        // },

        // Example: action button
        // {
        //     key: 'testConnection',
        //     type: 'action',
        //     labelKey: 'mods.myMod.config.test',
        //     actionLabelKey: 'mods.myMod.config.testBtn'
        // },
    ],

    // ===================== LLM Tools (NEW in v2) =====================

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
        //         // args.text contains the input
        //         return { result: args.text.toUpperCase() };
        //     }
        // },
    ],

    // ===================== Hooks (NEW in v2) =====================

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
     *
     * @param {ModContext} ctx  Init-time context (instanceId = null)
     *   ctx.ui.getShelfElement()  — this template's shelf panel
     *   ctx.events.on(...)        — auto-cleaned event subscriptions
     *   ctx.i18n.t(...)           — translation
     *   ctx.query.*               — MOD ecosystem queries
     *   ctx.getTemplate(id)       — alias for ctx.query.getTemplate
     *   ctx.getAllTemplates()      — alias for ctx.query.getAllTemplates
     *   ctx.getInstances()        — alias for ctx.query.getInstances
     *   ctx.getInstancesByTemplate(id) — alias
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
     *
     * @param {ModContext} ctx  Full activation context
     *   ctx.instanceId           — which instance was clicked
     *   ctx.config               — frozen instance config snapshot
     *   ctx.board.getText()      — read active textarea
     *   ctx.board.setText(text)  — write + dispatch 'input'
     *   ctx.board.insertAtCursor(text) — insert at cursor
     *   ctx.ui.toast(msg)        — show notification
     *   ctx.instance.getConfig(key) — live config read
     *   ctx.storage.get/set(k,v) — sandboxed localStorage
     *   ctx.net.apiRequest(ep)   — authenticated API calls
     *   ctx.file.upload(blob)    — file upload
     */
    async activate(ctx) {
        // Example: read text, process, show result
        // const text = ctx.board.getText();
        // if (!text) {
        //     ctx.ui.toast(ctx.i18n.t('mods.myMod.empty'));
        //     return;
        // }
        // const result = processText(text, ctx.config);
        // document.getElementById('my-mod-output').textContent = result;
    },

    /**
     * Called when shelf closes or button is deactivated.
     * @param {ModContext} ctx
     */
    async deactivate(ctx) {},

    /**
     * Called when any config field changes for any instance.
     * @param {ModContext|null} ctx  May be null if called from mod-state
     * @param {string} key          Config key that changed
     * @param {*} value             New value
     */
    onConfigChange(ctx, key, value) {},

    /**
     * Health check for the active provider.
     * @param {object} instanceConfig
     * @returns {Promise<string>} 'online' | 'offline'
     */
    async checkHealth(instanceConfig) {
        return 'online';
    },

    /**
     * Cleanup — called on MOD unload (rare).
     * @param {ModContext} ctx
     */
    destroy(ctx) {},
};
