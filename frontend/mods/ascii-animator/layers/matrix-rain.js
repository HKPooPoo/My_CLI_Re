/**
 * Matrix Rain Layer — Interactive WebGL2 ASCII rain (textmode.js)
 *
 * Renders in the screensaver overlay. Drops fall with trailing chars.
 * Mouse creates a repulsion field; click/touch spawns a shockwave.
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&';

/**
 * @param {HTMLElement} overlay - #press-start-overlay
 * @param {Object} config - { rainSpeed, rainDensity }
 * @returns {{ destroy(), updateConfig(key, val) }}
 */
export function createMatrixRain(overlay, config) {
    const canvas = document.createElement('canvas');
    canvas.id = 'aa-matrix-rain';
    canvas.width = overlay.clientWidth || window.innerWidth;
    canvas.height = overlay.clientHeight || window.innerHeight;
    overlay.insertBefore(canvas, overlay.firstChild);

    let rainSpeed = config.rainSpeed ?? 5;
    let rainDensity = config.rainDensity ?? 5;
    let destroyed = false;
    let tm = null;

    // Mouse state
    let mouseX = -9999, mouseY = -9999;
    let mouseGridX = 0, mouseGridY = 0;

    // Shockwaves
    const shockwaves = []; // { x, y, radius, maxRadius, strength }

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

    function pixelToGrid(px, py) {
        if (!cols || !rows) return [0, 0];
        const gx = (px / canvas.width) * cols - halfCols;
        const gy = (py / canvas.height) * rows - halfRows;
        return [gx, gy];
    }

    // Event handlers
    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        [mouseGridX, mouseGridY] = pixelToGrid(mouseX, mouseY);
    }

    function onTouchMove(e) {
        if (e.touches.length > 0) {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.touches[0].clientX - rect.left;
            mouseY = e.touches[0].clientY - rect.top;
            [mouseGridX, mouseGridY] = pixelToGrid(mouseX, mouseY);
        }
    }

    function onPointerDown(e) {
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
        const py = (e.clientY ?? e.touches?.[0]?.clientY ?? 0) - rect.top;
        const [gx, gy] = pixelToGrid(px, py);
        shockwaves.push({
            x: gx, y: gy,
            radius: 0, maxRadius: 15,
            strength: 3,
        });
    }

    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('touchmove', onTouchMove, { passive: true });
    overlay.addEventListener('mousedown', onPointerDown);
    overlay.addEventListener('touchstart', onPointerDown, { passive: true });

    // Create textmode.js instance
    try {
        tm = window.textmode.create({
            canvas,
            width: canvas.width,
            height: canvas.height,
            fontSize: 14,
            frameRate: 30,
        });
    } catch (e) {
        console.error('[matrix-rain] textmode.create failed:', e);
        // Fallback: try without canvas option
        try {
            tm = window.textmode.create({
                width: canvas.width,
                height: canvas.height,
                fontSize: 14,
                frameRate: 30,
            });
            // Move the created canvas into our overlay
            const createdCanvas = document.querySelector('canvas:not(#aa-matrix-rain):not(#aa-perlin-bg)');
            if (createdCanvas) {
                canvas.remove();
                createdCanvas.id = 'aa-matrix-rain';
                overlay.insertBefore(createdCanvas, overlay.firstChild);
            }
        } catch (e2) {
            console.error('[matrix-rain] textmode.create fallback failed:', e2);
            canvas.remove();
            return { destroy() {}, updateConfig() {} };
        }
    }

    tm.setup(() => {
        cols = tm.grid.cols;
        rows = tm.grid.rows;
        halfCols = Math.floor(cols / 2);
        halfRows = Math.floor(rows / 2);
        initDrops();
    });

    tm.draw(() => {
        if (destroyed) return;

        tm.background(0);

        // Update shockwaves
        for (let i = shockwaves.length - 1; i >= 0; i--) {
            shockwaves[i].radius += 0.5;
            shockwaves[i].strength *= 0.97;
            if (shockwaves[i].radius > shockwaves[i].maxRadius) {
                shockwaves.splice(i, 1);
            }
        }

        // Render drops
        for (const drop of drops) {
            drop.y += drop.speed;

            // Reset when fully off screen
            if (drop.y - drop.trailLen > halfRows) {
                if (Math.random() < 0.02 * rainSpeed) {
                    drop.y = -halfRows - Math.random() * 10;
                    drop.speed = (0.2 + Math.random() * 0.3) * (rainSpeed / 5);
                }
                continue;
            }

            // Mouse repulsion
            const dx = drop.col - mouseGridX;
            const dy = drop.y - mouseGridY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const repelRadius = 6;
            let offsetX = 0;
            if (dist < repelRadius && dist > 0) {
                offsetX = (dx / dist) * (repelRadius - dist) * 0.5;
            }

            // Shockwave push
            for (const sw of shockwaves) {
                const swDx = drop.col - sw.x;
                const swDy = drop.y - sw.y;
                const swDist = Math.sqrt(swDx * swDx + swDy * swDy);
                const ringDist = Math.abs(swDist - sw.radius);
                if (ringDist < 3 && swDist > 0) {
                    const push = sw.strength * (1 - ringDist / 3);
                    offsetX += (swDx / swDist) * push;
                    drop.y += (swDy / swDist) * push * 0.3;
                }
            }

            // Draw trail
            for (let t = 0; t < drop.trailLen; t++) {
                const ty = Math.floor(drop.y - t);
                if (ty < -halfRows || ty >= halfRows) continue;

                const renderX = Math.round(drop.col + offsetX * (1 - t / drop.trailLen));

                tm.push();
                tm.translate(renderX, ty, 0);

                if (t === 0) {
                    // Head: brightest
                    tm.char(randomChar());
                    tm.charColor(180, 255, 180);
                } else {
                    // Trail: fade from green to dark
                    const fade = 1 - (t / drop.trailLen);
                    const g = Math.floor(30 + 200 * fade);
                    tm.char(randomChar());
                    tm.charColor(0, g, 0);
                }
                tm.point();
                tm.pop();
            }
        }
    });

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
            overlay.removeEventListener('mousemove', onMouseMove);
            overlay.removeEventListener('touchmove', onTouchMove);
            overlay.removeEventListener('mousedown', onPointerDown);
            overlay.removeEventListener('touchstart', onPointerDown);
            try { tm.noLoop(); } catch (_) {}
            const el = document.getElementById('aa-matrix-rain');
            if (el) el.remove();
        },
    };
}
