/**
 * Perlin Noise Background Layer — textmode.js WebGL2
 *
 * Renders a slowly evolving noise field behind page content.
 * ASCII chars mapped from noise density: ' .:-=+*#@'
 * Mouse creates subtle parallax offset.
 */

// ===================== Value Noise 2D =====================
// Compact hash-based value noise with smooth interpolation.

const _p = new Uint8Array(512);
(function seedNoise() {
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    // Fisher-Yates shuffle with fixed seed for consistency
    let seed = 42;
    for (let i = 255; i > 0; i--) {
        seed = (seed * 16807 + 0) % 2147483647;
        const j = seed % (i + 1);
        [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) _p[i] = perm[i & 255];
})();

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }

function noise2D(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = _p[_p[xi] + yi] / 255;
    const ab = _p[_p[xi] + yi + 1] / 255;
    const ba = _p[_p[xi + 1] + yi] / 255;
    const bb = _p[_p[xi + 1] + yi + 1] / 255;

    return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
}

// ===================== ASCII Density Map =====================

const DENSITY = ' .:-=+*#@\u2588';

function noiseToDensityChar(val) {
    const idx = Math.min(DENSITY.length - 1, Math.max(0, Math.floor(val * DENSITY.length)));
    return DENSITY[idx];
}

// ===================== Layer Factory =====================

/**
 * @param {Object} config - { perlinOpacity, perlinSpeed }
 * @returns {{ destroy(), updateConfig(key, val) }}
 */
export function createPerlinBg(config) {
    let perlinOpacity = config.perlinOpacity ?? 8;
    let perlinSpeed = config.perlinSpeed ?? 3;
    let destroyed = false;
    let tm = null;

    // Mouse parallax
    let mouseOffX = 0, mouseOffY = 0;

    const container = document.querySelector('.body') || document.body;

    const canvas = document.createElement('canvas');
    canvas.id = 'aa-perlin-bg';
    canvas.width = container.clientWidth || window.innerWidth;
    canvas.height = container.clientHeight || window.innerHeight;
    container.insertBefore(canvas, container.firstChild);

    // Apply opacity
    canvas.style.opacity = perlinOpacity / 100;

    // Detect light theme for opacity boost
    const isLight = () => document.documentElement.classList.contains('theme-light');
    function applyOpacity() {
        const base = perlinOpacity / 100;
        canvas.style.opacity = isLight() ? base * 2.5 : base;
    }
    applyOpacity();

    // Mouse tracking (subtle parallax: 1:10 ratio)
    function onMouseMove(e) {
        mouseOffX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseOffY = (e.clientY / window.innerHeight - 0.5) * 2;
    }
    window.addEventListener('mousemove', onMouseMove);

    // Theme change
    function onThemeChanged() { applyOpacity(); }
    window.addEventListener('theme:changed', onThemeChanged);

    // Read --text-green color
    function getGreenRGB() {
        const style = getComputedStyle(document.documentElement);
        const raw = style.getPropertyValue('--text-green').trim();
        if (raw.startsWith('#')) {
            const hex = raw.slice(1);
            return [
                parseInt(hex.substring(0, 2), 16),
                parseInt(hex.substring(2, 4), 16),
                parseInt(hex.substring(4, 6), 16),
            ];
        }
        return [51, 255, 51]; // fallback
    }

    let greenRGB = getGreenRGB();

    // Create textmode.js instance
    try {
        tm = window.textmode.create({
            canvas,
            width: canvas.width,
            height: canvas.height,
            fontSize: 12,
            frameRate: 10,
        });
    } catch (e) {
        console.error('[perlin-bg] textmode.create failed:', e);
        canvas.remove();
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('theme:changed', onThemeChanged);
        return { destroy() {}, updateConfig() {} };
    }

    let cols = 0, rows = 0, halfCols = 0, halfRows = 0;

    tm.setup(() => {
        cols = tm.grid.cols;
        rows = tm.grid.rows;
        halfCols = Math.floor(cols / 2);
        halfRows = Math.floor(rows / 2);
        greenRGB = getGreenRGB();
    });

    tm.draw(() => {
        if (destroyed) return;

        tm.background(0, 0, 0, 0);

        const time = tm.frameCount * perlinSpeed * 0.002;

        for (let y = -halfRows; y < halfRows; y++) {
            for (let x = -halfCols; x < halfCols; x++) {
                const nx = (x + halfCols) * 0.06 + mouseOffX;
                const ny = (y + halfRows) * 0.06 + mouseOffY + time;
                const val = noise2D(nx, ny);

                if (val < 0.15) continue; // Skip empty cells for performance

                tm.push();
                tm.translate(x, y, 0);
                tm.char(noiseToDensityChar(val));

                const brightness = 0.3 + val * 0.7;
                tm.charColor(
                    Math.floor(greenRGB[0] * brightness),
                    Math.floor(greenRGB[1] * brightness),
                    Math.floor(greenRGB[2] * brightness),
                );
                tm.point();
                tm.pop();
            }
        }
    });

    return {
        updateConfig(key, val) {
            if (key === 'perlinOpacity') {
                perlinOpacity = val;
                applyOpacity();
            }
            if (key === 'perlinSpeed') {
                perlinSpeed = val;
            }
        },

        destroy() {
            destroyed = true;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('theme:changed', onThemeChanged);
            try { tm.noLoop(); } catch (_) {}
            const el = document.getElementById('aa-perlin-bg');
            if (el) el.remove();
        },
    };
}
