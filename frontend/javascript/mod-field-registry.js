/**
 * MOD Config Field Type Registry
 * =================================================================
 * Manages config field type renderers for the MOD config page.
 * Built-in types (select, text, range, toggle, info, action) are
 * registered by mods-manager.js at init time.
 * Templates can register custom types via ctx.ui.registerFieldType().
 *
 * Renderer function contract:
 *   (instanceId, template, field) => HTMLElement
 *
 * Where field = { key, type, labelKey, options?, min?, max?, step?,
 *                 default?, showWhen?, actionLabelKey?, placeholder? }
 * =================================================================
 */

const _renderers = {};

/**
 * Register a field type renderer.
 * @param {string} type       Field type name (e.g. 'select', 'api-key')
 * @param {Function} rendererFn  (instanceId, template, field) => HTMLElement
 */
export function registerFieldType(type, rendererFn) {
    _renderers[type] = rendererFn;
}

/**
 * Get a renderer for a field type. Falls back to 'text' if unknown.
 * @param {string} type
 * @returns {Function}
 */
export function getRenderer(type) {
    return _renderers[type] || _renderers['text'] || null;
}

/**
 * Check if a renderer exists for a field type.
 * @param {string} type
 * @returns {boolean}
 */
export function hasRenderer(type) {
    return type in _renderers;
}
