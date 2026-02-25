/**
 * MOD Context - Rich API Surface for MODs
 * =================================================================
 * Factory function that builds a per-invocation context object.
 * Wraps all platform APIs into a clean, sandboxed interface.
 *
 * Usage:
 *   const ctx = createModContext({ instanceId, templateId, page, buttonId, config });
 *   template.activate(ctx);
 *
 * Backward-compatible: all old ctx fields (page, buttonId, instanceId,
 * instanceConfig) are preserved as top-level aliases.
 *
 * IMPORTANT: This module must NOT import from mod-loader.js to avoid
 * circular dependencies. Query functions are injected via setQueryProvider().
 * =================================================================
 */

import { ModState } from './mod-state.js';
import { ModHooks } from './mod-hooks.js';
import { apiRequest } from './services/api.js';
import { FileService } from './services/file-service.js';
import { t, getActiveLocale } from './i18n.js';
import { BBMessage } from './blackboard-msg.js';
import { playAudio } from './audio.js';
import * as BoardProvider from './mod-board-provider.js';
import * as FieldRegistry from './mod-field-registry.js';

/**
 * Late-bound query provider — set by mod-loader.js at boot to break
 * the circular dependency (mod-context ↔ mod-loader).
 */
let _queryProvider = {
    getTemplate:            () => null,
    getAllTemplates:         () => [],
    getInstances:           () => [],
    getInstancesByTemplate: () => [],
};

/**
 * Called by mod-loader.js once during boot to inject query functions.
 * @param {object} provider  { getTemplate, getAllTemplates, getInstances, getInstancesByTemplate }
 */
export function setQueryProvider(provider) {
    _queryProvider = provider;
}

/**
 * Page-to-textarea mapping (shared across templates).
 * Templates can override via their own pages config.
 */
const DEFAULT_TEXTAREA_MAP = {
    'blackboard-log':    '#log-textarea',
    'broadcast-channel': '#channel-textarea',
};

/**
 * Page-to-scope mapping.
 */
const PAGE_SCOPE_MAP = {
    'blackboard-log':    'bb',
    'blackboard-branch': 'bb',
    'blackboard-misc':   'bb',
    'walkie-typie':      'wt',
    'broadcast-list':    'bc',
    'broadcast-channel': 'bc',
};

/**
 * Create a ModContext object for a MOD invocation.
 *
 * @param {object} opts
 * @param {string|null} opts.instanceId   Instance ID (null for init-time ctx)
 * @param {string}      opts.templateId   Template ID
 * @param {string|null} opts.page         Current page ID
 * @param {string|null} opts.buttonId     Button data-feature-btn value
 * @param {object}      opts.config       Instance config snapshot (frozen)
 * @param {object}      [opts.template]   Template definition reference
 * @returns {object} ModContext
 */
export function createModContext(opts) {
    const {
        instanceId = null,
        templateId,
        page = null,
        buttonId = null,
        config = {},
        template = null,
    } = opts;

    const frozenConfig = Object.freeze({ ...config });

    // Resolve textarea selector from template pages or defaults
    const textareaSelector = (() => {
        if (!page) return null;
        const tplPages = template?.pages;
        if (tplPages && tplPages[page]?.textareaSelector) {
            return tplPages[page].textareaSelector;
        }
        return DEFAULT_TEXTAREA_MAP[page] || null;
    })();

    // --- Event subscription tracking for auto-cleanup ---
    const _eventSubscriptions = [];

    const ctx = {
        // ===================== Identity (read-only) =====================
        instanceId,
        templateId,
        page,
        buttonId,
        config: frozenConfig,

        // Backward-compatible alias
        instanceConfig: frozenConfig,

        // ===================== Instance State =====================
        instance: {
            getConfig(key) {
                if (!instanceId) return null;
                return ModState.getConfig(instanceId, key);
            },
            setConfig(key, val) {
                if (!instanceId) return;
                ModState.setConfig(instanceId, key, val);
            },
            isEnabled() {
                // Instance existence = enabled (ADD/DELETE model)
                return !!instanceId && !!ModState.getInstance(instanceId);
            },
            setEnabled(_bool) {
                // No-op: ADD/DELETE model — use addInstance/removeInstance instead
            },
            getServerStatus() {
                if (!instanceId) return 'unknown';
                return ModState.getServerStatus(instanceId);
            },
            getSiblings() {
                if (!templateId) return [];
                return ModState.getInstancesByTemplate(templateId)
                    .filter(i => i.instanceId !== instanceId);
            }
        },

        // ===================== Board / Textarea =====================
        board: {
            getText() {
                const el = _getTextarea();
                return el ? el.value : '';
            },
            setText(text) {
                const el = _getTextarea();
                if (!el) return;
                el.value = text;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            },
            insertAtCursor(text) {
                const el = _getTextarea();
                if (!el) return;
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const before = el.value.substring(0, start);
                const after = el.value.substring(end);
                el.value = before + text + after;
                const newPos = start + text.length;
                el.setSelectionRange(newPos, newPos);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            },
            replaceSelection(text) {
                const el = _getTextarea();
                if (!el) return;
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const before = el.value.substring(0, start);
                const after = el.value.substring(end);
                el.value = before + text + after;
                el.setSelectionRange(start, start + text.length);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            },
            getSelection() {
                const el = _getTextarea();
                if (!el) return { start: 0, end: 0, text: '' };
                return {
                    start: el.selectionStart,
                    end: el.selectionEnd,
                    text: el.value.substring(el.selectionStart, el.selectionEnd)
                };
            },
            getTextarea() {
                return _getTextarea();
            },
            getScope() {
                return page ? (PAGE_SCOPE_MAP[page] || null) : null;
            },
            getBranchId() {
                const scope = this.getScope();
                if (!scope) return null;
                const meta = BoardProvider.getCurrentRecord(scope);
                return meta?.branchId ?? null;
            },
            getBranchName() {
                const scope = this.getScope();
                if (!scope) return null;
                const meta = BoardProvider.getCurrentRecord(scope);
                return meta?.branchName ?? null;
            },

            // --- Data access APIs (v2.1) ---

            getCurrentRecord() {
                const scope = this.getScope();
                if (!scope) return null;
                return BoardProvider.getCurrentRecord(scope);
            },
            isVirtual() {
                const record = this.getCurrentRecord();
                return record?.isVirtual ?? false;
            },
            getAttachments() {
                const scope = this.getScope();
                if (!scope) return [];
                return BoardProvider.getAttachments(scope);
            },
            async getAllRecords() {
                const scope = this.getScope();
                const meta = BoardProvider.getCurrentRecord(scope);
                if (!meta) return [];
                return BoardProvider.getAllRecords(scope, meta.branchId, meta.owner);
            },
            async getAllBranches() {
                const scope = this.getScope();
                const meta = BoardProvider.getCurrentRecord(scope);
                if (!meta) return [];
                return BoardProvider.getAllBranches(scope, meta.owner);
            },
        },

        // ===================== UI =====================
        ui: {
            toast(msg, duration) {
                return BBMessage.info(msg, duration);
            },
            toastError(msg) {
                return BBMessage.error(msg);
            },
            toastSuccess(msg) {
                return BBMessage.success(msg);
            },
            getShelfElement() {
                const shelfId = template?.shelfPanelId;
                if (!shelfId) return null;
                return document.querySelector(`[data-feature-shelf="${shelfId}"]`);
            },
            openShelf() {
                const container = document.querySelector('.feature-shelf-container');
                if (!container) return;
                const shelfId = template?.shelfPanelId;
                if (shelfId) {
                    const shelves = container.querySelectorAll('.feature-shelf');
                    shelves.forEach(s => {
                        s.style.display = s.dataset.featureShelf === shelfId ? 'flex' : 'none';
                    });
                }
                const screenWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
                const cssVar = getComputedStyle(container).getPropertyValue('--shelf-open-width').trim();
                const widthVw = cssVar ? parseFloat(cssVar) : 60;
                container.style.transform = `translate3d(${-1 * (widthVw / 100) * screenWidth}px, 0, 0)`;
            },
            closeShelf() {
                const container = document.querySelector('.feature-shelf-container');
                if (!container) return;
                container.style.transform = 'translate3d(0, 0, 0)';
            },
            playSound(filename) {
                playAudio(filename);
            },
            registerFieldType(type, rendererFn) {
                FieldRegistry.registerFieldType(type, rendererFn);
            }
        },

        // ===================== i18n =====================
        i18n: {
            t(key, vars) {
                return t(key, vars);
            },
            getLocale() {
                return getActiveLocale();
            }
        },

        // ===================== Storage (sandboxed per-instance) =====================
        storage: {
            _prefix() {
                return instanceId ? `mod-data:${instanceId}:` : `mod-data:${templateId}:`;
            },
            get(key) {
                try {
                    const raw = localStorage.getItem(this._prefix() + key);
                    if (raw === null) return null;
                    return JSON.parse(raw);
                } catch {
                    return localStorage.getItem(this._prefix() + key);
                }
            },
            set(key, value) {
                localStorage.setItem(this._prefix() + key, JSON.stringify(value));
            },
            remove(key) {
                localStorage.removeItem(this._prefix() + key);
            },
            clear() {
                const prefix = this._prefix();
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith(prefix)) keysToRemove.push(k);
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
            }
        },

        // ===================== Network =====================
        net: {
            apiRequest(endpoint, opts) {
                return apiRequest(endpoint, opts);
            },
            fetch(url, opts) {
                return fetch(url, opts);
            }
        },

        // ===================== File Operations =====================
        file: {
            async upload(fileOrBlob) {
                return await FileService.upload(fileOrBlob);
            },
            async download(hash) {
                return await FileService.download(hash);
            },
            async exists(hash) {
                return await FileService.exists(hash);
            },
            async getMeta(hash) {
                return await FileService.meta(hash);
            },
            getDownloadUrl(hash) {
                return FileService.downloadUrl(hash);
            },
            async readContent(hash) {
                return BoardProvider.readFileContent(hash);
            },
            async readText(hash) {
                return BoardProvider.readFileText(hash);
            }
        },

        // ===================== Events (auto-cleanup) =====================
        events: {
            on(event, handler) {
                window.addEventListener(event, handler);
                _eventSubscriptions.push({ event, handler });
            },
            off(event, handler) {
                window.removeEventListener(event, handler);
                const idx = _eventSubscriptions.findIndex(
                    s => s.event === event && s.handler === handler
                );
                if (idx !== -1) _eventSubscriptions.splice(idx, 1);
            },
            once(event, handler) {
                const wrapped = (e) => {
                    handler(e);
                    ctx.events.off(event, wrapped);
                };
                ctx.events.on(event, wrapped);
            },
            emit(event, detail) {
                window.dispatchEvent(new CustomEvent(event, { detail }));
            }
        },

        // ===================== Hooks =====================
        hooks: {
            register(name, handler, priority) {
                ModHooks.register(name, handler, priority, instanceId || templateId);
            },
            unregister(name, handler) {
                ModHooks.unregister(name, handler);
            }
        },

        // ===================== Query (MOD ecosystem) =====================
        query: {
            getTemplate(id) { return _queryProvider.getTemplate(id); },
            getAllTemplates() { return _queryProvider.getAllTemplates(); },
            getInstances() { return _queryProvider.getInstances(); },
            getInstancesByTemplate(id) { return _queryProvider.getInstancesByTemplate(id); }
        },

        // ===================== Cleanup =====================
        _cleanup() {
            for (const { event, handler } of _eventSubscriptions) {
                window.removeEventListener(event, handler);
            }
            _eventSubscriptions.length = 0;
        }
    };

    // --- Private helpers ---
    function _getTextarea() {
        if (!textareaSelector) return null;
        return document.querySelector(textareaSelector);
    }

    return ctx;
}

/**
 * Create a lightweight init-time context (no instance, no page).
 * Used when calling template.init() during boot.
 *
 * @param {string} templateId
 * @param {object} template  Template definition reference
 * @returns {object} ModContext with init-time query APIs
 */
export function createInitContext(templateId, template) {
    const ctx = createModContext({
        instanceId: null,
        templateId,
        page: null,
        buttonId: null,
        config: {},
        template,
    });

    // Add legacy aliases that init() previously received
    ctx.getTemplate = ctx.query.getTemplate;
    ctx.getAllTemplates = ctx.query.getAllTemplates;
    ctx.getInstances = ctx.query.getInstances;
    ctx.getInstancesByTemplate = ctx.query.getInstancesByTemplate;

    return ctx;
}
