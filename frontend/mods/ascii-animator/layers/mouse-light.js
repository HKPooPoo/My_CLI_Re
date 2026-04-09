/**
 * Mouse Light Layer — CSS-based cursor flashlight
 *
 * Creates an additive radial glow that follows the mouse cursor.
 * Uses mix-blend-mode: screen on dark backgrounds for a natural
 * "flashlight illumination" effect. Pure CSS — no WebGL context.
 */

/**
 * @param {Object} config - { lightRadius }
 * @returns {{ destroy(), updateConfig(key, val) }}
 */
export function createMouseLight(config) {
    const radius = (config.lightRadius ?? 8) * 20; // 3..15 → 60..300 px

    const el = document.createElement('div');
    el.id = 'aa-mouse-light';
    el.style.setProperty('--aa-lr', radius + 'px');
    // Start off-screen
    el.style.setProperty('--aa-mx', '-200px');
    el.style.setProperty('--aa-my', '-200px');
    document.body.appendChild(el);

    function onMouseMove(e) {
        el.style.setProperty('--aa-mx', e.clientX + 'px');
        el.style.setProperty('--aa-my', e.clientY + 'px');
    }

    function onMouseLeave() {
        el.style.setProperty('--aa-mx', '-200px');
        el.style.setProperty('--aa-my', '-200px');
    }

    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);

    return {
        updateConfig(key, val) {
            if (key === 'lightRadius') {
                el.style.setProperty('--aa-lr', (val * 20) + 'px');
            }
        },

        destroy() {
            window.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseleave', onMouseLeave);
            el.remove();
        },
    };
}
