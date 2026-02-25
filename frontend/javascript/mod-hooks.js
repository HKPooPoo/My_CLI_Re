/**
 * MOD Hooks - Priority-Ordered Event Pipeline
 * =================================================================
 * Allows MODs to register handlers for named hook points.
 * Handlers run in priority order (lower = first). Any handler
 * can cancel the pipeline by calling event.cancel().
 *
 * Hook points are instrumented in core modules (Phase C, deferred).
 * MODs register hooks declaratively via template.hooks[] or
 * imperatively via ctx.hooks.register().
 * =================================================================
 */

const _hooks = {};  // hookName → [{ handler, priority, ownerId }]

export const ModHooks = {
    /**
     * Register a handler for a named hook point.
     * @param {string} name       Hook name, e.g. 'board:beforeSave'
     * @param {Function} handler  async (event) => void
     * @param {number} [priority] Lower runs first (default 100)
     * @param {string} [ownerId]  Template or instance ID for cleanup
     */
    register(name, handler, priority = 100, ownerId = null) {
        if (!_hooks[name]) _hooks[name] = [];
        _hooks[name].push({ handler, priority, ownerId });
        _hooks[name].sort((a, b) => a.priority - b.priority);
    },

    /**
     * Unregister a specific handler from a hook point.
     * @param {string} name
     * @param {Function} handler
     */
    unregister(name, handler) {
        if (!_hooks[name]) return;
        _hooks[name] = _hooks[name].filter(h => h.handler !== handler);
        if (_hooks[name].length === 0) delete _hooks[name];
    },

    /**
     * Unregister ALL handlers owned by a given ownerId.
     * Called when a MOD instance is removed.
     * @param {string} ownerId
     */
    unregisterAll(ownerId) {
        for (const name of Object.keys(_hooks)) {
            _hooks[name] = _hooks[name].filter(h => h.ownerId !== ownerId);
            if (_hooks[name].length === 0) delete _hooks[name];
        }
    },

    /**
     * Run all handlers for a hook point in priority order.
     * Returns a HookEvent with cancel/data support.
     *
     * @param {string} name   Hook name
     * @param {object} [data] Data payload (mutable by handlers)
     * @returns {Promise<{ cancelled: boolean, data: object }>}
     */
    async run(name, data = {}) {
        const event = {
            name,
            data,
            _cancelled: false,
            cancel() { this._cancelled = true; },
            get cancelled() { return this._cancelled; }
        };

        const handlers = _hooks[name];
        if (!handlers || handlers.length === 0) return event;

        for (const { handler } of handlers) {
            try {
                await handler(event);
            } catch (e) {
                console.error(`[mod-hooks] Error in hook "${name}":`, e);
            }
            if (event._cancelled) break;
        }

        return event;
    },

    /**
     * Check if any handlers are registered for a hook.
     * @param {string} name
     * @returns {boolean}
     */
    has(name) {
        return !!_hooks[name] && _hooks[name].length > 0;
    },

    /**
     * Get all registered hook names (for debugging).
     * @returns {string[]}
     */
    getRegisteredHooks() {
        return Object.keys(_hooks);
    }
};
