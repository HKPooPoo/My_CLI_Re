/**
 * TimerGroup — Named timer lifecycle manager.
 *
 * Replaces scattered clearTimeout/setTimeout pairs with a single object
 * that guarantees correct cancel/flush semantics across lifecycle events
 * (auth change, connection switch, PUSH/PULL navigation, etc.).
 *
 * Usage:
 *   const timers = new TimerGroup();
 *   timers.schedule('save', () => persist(text), 200);
 *   timers.cancel('save');          // discard pending
 *   timers.cancelAll();             // discard all — e.g. on logout
 *   timers.flush('save');           // execute NOW then remove
 */
export class TimerGroup {
    #timers = new Map();

    /** Schedule (or reschedule) a named timer. */
    schedule(name, fn, delay) {
        this.cancel(name);
        this.#timers.set(name, {
            id: setTimeout(() => {
                this.#timers.delete(name);
                fn();
            }, delay),
            fn
        });
    }

    /** Cancel a single timer by name (no-op if absent). */
    cancel(name) {
        const t = this.#timers.get(name);
        if (t) { clearTimeout(t.id); this.#timers.delete(name); }
    }

    /** Cancel all pending timers. */
    cancelAll() {
        for (const t of this.#timers.values()) clearTimeout(t.id);
        this.#timers.clear();
    }

    /** Execute a timer's callback immediately, then remove it. */
    flush(name) {
        const t = this.#timers.get(name);
        if (t) { clearTimeout(t.id); this.#timers.delete(name); t.fn(); }
    }

    /** Execute all pending callbacks immediately. */
    flushAll() {
        const pending = [...this.#timers.values()];
        for (const t of pending) clearTimeout(t.id);
        this.#timers.clear();
        for (const t of pending) t.fn();
    }

    /** Check if a timer is pending. */
    has(name) { return this.#timers.has(name); }
}
