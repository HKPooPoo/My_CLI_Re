/**
 * LLM — Generic textarea LLM processing.
 * Reads the focused textarea on any page. Simple prompt → response.
 */

import { ModState } from '../../javascript/mod-state.js';
import {
    ICONS, PROVIDERS, PROVIDER_CONFIG_SCHEMA,
    ensureOutputEl, initShelf, activateShelfPrompt, runLlm,
    checkHealth, getInfoValue, onAction,
    getInstanceName, getIconUrl,
} from './_shared.js';

// ===================== Constants =====================

const PRESETS = [
    { labelKey: 'mods.llm.preset.summarize', value: 'Summarize concisely.' },
    { labelKey: 'mods.llm.preset.translate', value: 'Translate to English.' },
    { labelKey: 'mods.llm.preset.polish',    value: 'Improve grammar and clarity. Keep the original meaning.' },
    { labelKey: 'mods.llm.preset.explain',   value: 'Explain in simple terms.' },
];

// ===================== Template =====================

export default {
    id: 'llm',
    group: 'llm',
    nameKey: 'mods.llm.name',
    descriptionKey: 'mods.llm.desc',
    version: '4.0.0',
    minApiVersion: 1,
    shelfPanelId: 'llm',

    getButtonDataId(config) {
        return 'llm-' + (config.icon || 'summarize');
    },

    getInstanceName(config, tFn) {
        return getInstanceName(config, tFn, 'mods.llm.name');
    },

    getIconUrl(config) {
        return getIconUrl(config);
    },

    defaultInstances: [
        { config: { prompt: 'Translate to English.', icon: 'translate', provider: 'client' } },
        { config: { prompt: 'Summarize concisely.', icon: 'summarize', provider: 'client' } },
        { config: { prompt: 'Improve grammar and clarity. Keep the original meaning.', icon: 'polish', provider: 'client' } },
    ],

    pages: {
        'blackboard-log':    { textareaSelector: '#log-textarea' },
        'broadcast-channel': { textareaSelector: '#channel-textarea' },
    },

    providers: PROVIDERS,

    configSchema: [
        { key: 'prompt', type: 'textarea', labelKey: 'mods.llm.config.prompt', default: '', rows: 3,
          presets: PRESETS },
        { key: 'icon', type: 'icon-picker', labelKey: 'mods.llm.config.icon', default: 'summarize',
          icons: ICONS },
        ...PROVIDER_CONFIG_SCHEMA,
    ],

    _outputEl: null,

    async init(ctx) {
        _migrateOldConfig();
        initShelf(this, ctx);
    },

    async activate(ctx) {
        if (!ctx) return;
        const out = ensureOutputEl(this);
        if (!out) return;
        activateShelfPrompt(ctx);

        const tFn = ctx.i18n.t;
        const prompt = ctx.config.prompt;

        if (!prompt) { out.value = tFn('mods.llm.noPrompt'); return; }
        out.value = tFn('mods.llm.processing');

        try {
            const inputText = ctx.board.getText().trim();
            if (!inputText) { out.value = tFn('mods.llm.empty'); return; }
            await runLlm(ctx.config, prompt, inputText, out, tFn);
        } catch (e) {
            console.error('[llm] activate error:', e);
            out.value = tFn('mods.llm.error', { error: e.message || String(e) });
        }
    },

    async deactivate() {},
    destroy() {},
    checkHealth,
    getInfoValue,
    onAction,
};

// ===================== Migration =====================

/**
 * Migrate old config format (task-based) to new format (prompt/icon).
 * Runs once at init — checks all LLM instances for old `task` key.
 */
function _migrateOldConfig() {
    const instances = ModState.getInstancesByTemplate('llm');
    for (const inst of instances) {
        const config = inst.config;
        if (!config.task) continue;

        const task = config.task;
        let prompt = config.systemPrompt || '';
        let icon = 'summarize';

        const LANG_NAMES = { 'zh-TW': '繁體中文', 'zh-CN': '简体中文', 'en': 'English', 'ja': '日本語' };

        switch (task) {
            case 'translate': {
                const lang = LANG_NAMES[config.targetLang] || config.targetLang || '繁體中文';
                if (!prompt) prompt = `Translate to ${lang}.`;
                icon = 'translate';
                break;
            }
            case 'summarize':
                if (!prompt) prompt = 'Summarize concisely. Output plain text only.';
                break;
            case 'polish':
                if (!prompt) prompt = 'Improve grammar and style. Keep the original meaning. Output only the improved text.';
                icon = 'polish';
                break;
            case 'summarize-files':
                if (!prompt) prompt = 'Summarize the text and file contents. Output plain text only.';
                icon = 'summarize-files';
                break;
            case 'summarize-branch':
                if (!prompt) prompt = 'Summarize these entries. Identify key themes. Output plain text only.';
                icon = 'summarize-branch';
                break;
            case 'summarize-all':
                if (!prompt) prompt = 'Summarize across all branches. Identify patterns. Output plain text only.';
                icon = 'summarize-all';
                break;
            default:
                if (!prompt) prompt = 'Summarize concisely. Output plain text only.';
                break;
        }

        ModState.setConfig(inst.instanceId, 'prompt', prompt);
        ModState.setConfig(inst.instanceId, 'icon', icon);
        console.log(`[llm] migrated instance ${inst.instanceId}: task="${task}" → prompt/icon`);
    }
}
