/**
 * Shelf Spinner Layer — Classic ASCII loading animation on textareas
 *
 * Watches document for textareas with data-loading="true" and appends
 * a rotating / - \ | spinner on a new line.
 *
 * Stability-aware: only spins when the textarea value has stabilized
 * (not during active LLM streaming where content flows visibly).
 * When content is streaming via +=, the spinner auto-hides — the
 * flowing text itself is sufficient visual feedback.
 *
 * When data-loading is removed, the spinner suffix is stripped and
 * the interval is cleaned up via MutationObserver.
 *
 * Spinner frames (classic ASCII):
 *   / - \ |
 */

const SPINNER_FRAMES = ['/', '-', '\\', '|'];
const FRAME_INTERVAL = 150;   // ms per frame
const STABLE_MS      = 250;   // ms of unchanged value before spinner appears

const SPINNER_SUFFIX = /\n[/\-\\|]$/;

/**
 * @returns {{ destroy() }}
 */
export function createShelfSpinner() {
    const active = new Map();

    function attachSpinner(textarea) {
        if (active.has(textarea)) return;

        let frame = 0;
        let lastSeen = '';      // last "real" content (spinner stripped)
        let stableSince = 0;    // when value last changed

        const interval = setInterval(() => {
            const entry = active.get(textarea);
            if (!entry || !textarea.isConnected) {
                clearInterval(interval);
                active.delete(textarea);
                return;
            }

            frame = (frame + 1) % SPINNER_FRAMES.length;
            entry.frame = frame;

            const raw = textarea.value;
            const stripped = raw.replace(SPINNER_SUFFIX, '');
            const now = Date.now();

            if (stripped !== lastSeen) {
                // External change (MOD wrote new text or streaming)
                lastSeen = stripped;
                stableSince = now;
            } else if (now - stableSince >= STABLE_MS && stripped !== '') {
                // Value stabilized on non-empty text — spin
                textarea.value = stripped + '\n' + SPINNER_FRAMES[frame];
                textarea.scrollTop = textarea.scrollHeight;
            }
        }, FRAME_INTERVAL);

        active.set(textarea, { interval, frame: 0 });
    }

    function detachSpinner(textarea) {
        const entry = active.get(textarea);
        if (!entry) return;
        clearInterval(entry.interval);

        // Strip spinner suffix if present
        const val = textarea.value;
        const cleaned = val.replace(SPINNER_SUFFIX, '');
        if (cleaned !== val) textarea.value = cleaned;

        active.delete(textarea);
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type !== 'attributes' || mutation.attributeName !== 'data-loading') continue;
            const el = mutation.target;
            if (el.tagName !== 'TEXTAREA') continue;

            if (el.dataset.loading === 'true') {
                attachSpinner(el);
            } else {
                detachSpinner(el);
            }
        }
    });

    observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-loading'],
    });

    document.querySelectorAll('textarea[data-loading="true"]').forEach(attachSpinner);

    return {
        destroy() {
            observer.disconnect();
            for (const [textarea, entry] of active) {
                clearInterval(entry.interval);
                if (textarea.isConnected) {
                    const cleaned = textarea.value.replace(SPINNER_SUFFIX, '');
                    if (cleaned !== textarea.value) textarea.value = cleaned;
                }
            }
            active.clear();
        },
    };
}
