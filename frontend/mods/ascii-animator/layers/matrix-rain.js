/**
 * Matrix Rain Layer — WebGL2 ASCII rain (textmode.js)
 *
 * Renders in the screensaver overlay. Drops fall with trailing chars.
 * Adapts color scheme to light/dark theme.
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&';

/**
 * @param {HTMLElement} overlay - #press-start-overlay
 * @param {Object} config - { rainSpeed, rainDensity, light }
 * @returns {{ destroy(), updateConfig(key, val) }}
 */
export function createMatrixRain(overlay, config) {
    const canvas = document.createElement('canvas');
    canvas.id = 'aa-matrix-rain';
    overlay.insertBefore(canvas, overlay.firstChild);

    let rainSpeed = config.rainSpeed ?? 5;
    let rainDensity = config.rainDensity ?? 5;
    const light = !!config.light;
    let destroyed = false;
    let tm = null;

    // Drops
    let drops = [];
    let cols = 0, rows = 0, halfCols = 0, halfRows = 0;

    function randomChar() {
        return CHARS[Math.floor(Math.random() * CHARS.length)];
    }

    function initDrops() {
        drops = [];
        const activeCols = Math.max(1, Math.floor(cols * rainDensity / 10));
        const colStep = Math.max(1, Math.floor(cols / activeCols));

        for (let c = -halfCols; c < halfCols; c += colStep) {
            drops.push({
                col: c,
                y: -halfRows - Math.random() * rows,
                speed: (0.2 + Math.random() * 0.3) * (rainSpeed / 5),
                trailLen: 8 + Math.floor(Math.random() * 16),
            });
        }
    }

    // --- Resize handling ---
    function sizeCanvas() {
        canvas.width = overlay.clientWidth || window.innerWidth;
        canvas.height = overlay.clientHeight || window.innerHeight;
    }
    sizeCanvas();

    let resizeTimer = null;
    function onResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (destroyed) return;
            sizeCanvas();
            if (tm) {
                try { tm.noLoop(); } catch (_) {}
            }
            // Recreate textmode instance with new size
            tm = _createTm();
            if (tm) _wireDrawLoop(tm);
        }, 200);
    }
    window.addEventListener('resize', onResize);

    // --- textmode.js creation ---
    function _createTm() {
        try {
            return window.textmode.create({
                canvas,
                width: canvas.width,
                height: canvas.height,
                fontSize: 14,
                frameRate: 30,
            });
        } catch (e) {
            console.error('[matrix-rain] textmode.create failed:', e);
            try {
                const inst = window.textmode.create({
                    width: canvas.width,
                    height: canvas.height,
                    fontSize: 14,
                    frameRate: 30,
                });
                const createdCanvas = document.querySelector('canvas:not(#aa-matrix-rain):not(#aa-perlin-bg)');
                if (createdCanvas) {
                    canvas.remove();
                    createdCanvas.id = 'aa-matrix-rain';
                    overlay.insertBefore(createdCanvas, overlay.firstChild);
                }
                return inst;
            } catch (e2) {
                console.error('[matrix-rain] textmode.create fallback failed:', e2);
                return null;
            }
        }
    }

    function _wireDrawLoop(instance) {
        instance.setup(() => {
            cols = instance.grid.cols;
            rows = instance.grid.rows;
            halfCols = Math.floor(cols / 2);
            halfRows = Math.floor(rows / 2);
            initDrops();
        });

        instance.draw(() => {
            if (destroyed) return;

            instance.background(0, 0, 0, 0);
            instance.cellColor(0, 0, 0, 0);

            for (const drop of drops) {
                drop.y += drop.speed;

                if (drop.y - drop.trailLen > halfRows) {
                    if (Math.random() < 0.02 * rainSpeed) {
                        drop.y = -halfRows - Math.random() * 10;
                        drop.speed = (0.2 + Math.random() * 0.3) * (rainSpeed / 5);
                    }
                    continue;
                }

                for (let t = 0; t < drop.trailLen; t++) {
                    const ty = Math.floor(drop.y - t);
                    if (ty < -halfRows || ty >= halfRows) continue;

                    instance.push();
                    instance.translate(drop.col, ty, 0);

                    if (t === 0) {
                        instance.char(randomChar());
                        if (light) instance.charColor(30, 30, 30);
                        else instance.charColor(180, 255, 180);
                    } else {
                        const fade = 1 - (t / drop.trailLen);
                        instance.char(randomChar());
                        if (light) {
                            const v = Math.floor(230 - 180 * fade);
                            instance.charColor(v, v, v);
                        } else {
                            const g = Math.floor(30 + 200 * fade);
                            instance.charColor(0, g, 0);
                        }
                    }
                    instance.point();
                    instance.pop();
                }
            }
        });
    }

    // Initial creation
    tm = _createTm();
    if (!tm) {
        canvas.remove();
        window.removeEventListener('resize', onResize);
        return { destroy() {}, updateConfig() {} };
    }
    _wireDrawLoop(tm);

    return {
        updateConfig(key, val) {
            if (key === 'rainSpeed') {
                rainSpeed = val;
                for (const d of drops) {
                    d.speed = (0.2 + Math.random() * 0.3) * (rainSpeed / 5);
                }
            }
            if (key === 'rainDensity') {
                rainDensity = val;
                initDrops();
            }
        },

        destroy() {
            destroyed = true;
            clearTimeout(resizeTimer);
            window.removeEventListener('resize', onResize);
            try { tm.noLoop(); } catch (_) {}
            const el = document.getElementById('aa-matrix-rain');
            if (el) el.remove();
        },
    };
}
