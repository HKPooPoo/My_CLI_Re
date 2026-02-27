/**
 * Toast Spinner Layer — Braille loading animation on toasts
 *
 * Watches #toast-container for new loading toasts (data-loading="true")
 * and prepends an animated braille spinner character to textContent.
 * No child elements injected — pure textContent manipulation avoids
 * flex-column layout issues (all div/span are flex-column in this project).
 *
 * When .update() sets textContent + removes data-loading, the spinner
 * interval is cleaned up via MutationObserver.
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

    // Track active spinners: Map<Element, { interval, baseText }>
    const active = new Map();

    function attachSpinner(toast) {
        if (active.has(toast)) return;

        // Capture the original text and prepend spinner into textContent
        const baseText = toast.textContent;
        toast.textContent = SPINNER_FRAMES[0] + ' ' + baseText;

        let frame = 0;
        const interval = setInterval(() => {
            frame = (frame + 1) % SPINNER_FRAMES.length;
            // Guard: if toast was removed or textContent was overwritten by .update()
            const entry = active.get(toast);
            if (!entry || !toast.isConnected) {
                clearInterval(interval);
                active.delete(toast);
                return;
            }
            toast.textContent = SPINNER_FRAMES[frame] + ' ' + entry.baseText;
        }, FRAME_INTERVAL);

        active.set(toast, { interval, baseText });
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
            // Restore original text for any active spinners
            for (const [toast, entry] of active) {
                clearInterval(entry.interval);
                if (toast.isConnected) toast.textContent = entry.baseText;
            }
            active.clear();
        },
    };
}
