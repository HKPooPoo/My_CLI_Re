/**
 * Toast Spinner Layer — Braille loading animation on toasts
 *
 * Watches #toast-container for new loading toasts (data-loading="true")
 * and injects an animated braille spinner. The spinner is naturally
 * destroyed when .update() sets textContent on the toast.
 *
 * Spinner frames (braille pattern — great in monospace):
 *   ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
 */

const SPINNER_FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
const FRAME_INTERVAL = 80; // ms per frame

/**
 * @returns {{ destroy() }}
 */
export function createToastSpinner() {
    const container = document.getElementById('toast-container');
    if (!container) return { destroy() {} };

    // Track active spinners: Map<Element, { interval, frame }>
    const active = new Map();

    function attachSpinner(toast) {
        if (active.has(toast)) return;

        // Capture original text and restructure DOM
        const originalText = toast.textContent;
        toast.textContent = '';

        const spinnerSpan = document.createElement('span');
        spinnerSpan.className = 'aa-spinner';
        spinnerSpan.textContent = SPINNER_FRAMES[0];

        const textSpan = document.createElement('span');
        textSpan.className = 'aa-toast-text';
        textSpan.textContent = originalText;

        toast.appendChild(spinnerSpan);
        toast.appendChild(textSpan);

        let frame = 0;
        const interval = setInterval(() => {
            frame = (frame + 1) % SPINNER_FRAMES.length;
            // Guard: spinner may have been destroyed by textContent override
            if (spinnerSpan.isConnected) {
                spinnerSpan.textContent = SPINNER_FRAMES[frame];
            } else {
                clearInterval(interval);
                active.delete(toast);
            }
        }, FRAME_INTERVAL);

        active.set(toast, { interval });
    }

    function detachSpinner(toast) {
        const entry = active.get(toast);
        if (entry) {
            clearInterval(entry.interval);
            active.delete(toast);
        }
    }

    // Observe toast container for new loading toasts + attribute changes
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // New toast added
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && node.dataset?.loading === 'true') {
                        attachSpinner(node);
                    }
                }
                // Toast removed from DOM
                for (const node of mutation.removedNodes) {
                    if (node.nodeType === 1) detachSpinner(node);
                }
            }

            // data-loading attribute removed (by .update())
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-loading') {
                const toast = mutation.target;
                if (!toast.dataset?.loading) {
                    detachSpinner(toast);
                }
            }
        }
    });

    observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-loading'],
    });

    // Also catch any existing loading toasts
    container.querySelectorAll('.toast-info[data-loading]').forEach(attachSpinner);

    return {
        destroy() {
            observer.disconnect();
            for (const [_toast, entry] of active) {
                clearInterval(entry.interval);
            }
            active.clear();
        },
    };
}
