/**
 * Stopwatch MOD — Simple start/stop/lap stopwatch in the shelf panel.
 * State lives on `this` (template singleton, maxInstances: 1).
 * Timer continues running even when shelf is closed.
 */

const SW_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z'/%3E%3C/svg%3E";

const SW_CSS = `
.sw-wrapper {
    flex: 1;
    min-height: 0;
    width: 100%;
    gap: 6px;
    align-items: center;
}

.sw-display {
    font-family: 'Courier New', monospace;
    font-size: 2.2em;
    color: var(--text-green);
    text-shadow: 0 0 10px var(--text-green);
    text-align: center;
    padding: 10px 0 4px;
    letter-spacing: 2px;
}

.sw-display.running {
    color: var(--text-cyan);
    text-shadow: 0 0 10px var(--text-cyan);
}

.sw-controls {
    flex-direction: row;
    gap: 8px;
    justify-content: center;
    width: 100%;
}

.sw-btn {
    flex: 1;
    padding: 8px 0;
    border: var(--border-line);
    border-radius: var(--border-radius);
    background: var(--bg-secondary);
    color: var(--text-green);
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    text-align: center;
}

.sw-btn:active {
    background: var(--text-green);
    color: var(--bg-primary);
}

.sw-btn-stop {
    color: var(--text-red);
    border-color: var(--text-red);
}

.sw-btn-stop:active {
    background: var(--text-red);
    color: var(--bg-primary);
}

.sw-btn-lap {
    color: var(--text-orange);
    border-color: var(--text-orange);
}

.sw-btn-lap:active {
    background: var(--text-orange);
    color: var(--bg-primary);
}

.sw-btn-reset {
    color: var(--text-red);
    border-color: var(--text-red);
}

.sw-btn-reset:active {
    background: var(--text-red);
    color: var(--bg-primary);
}

.sw-laps {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    width: 100%;
    gap: 0;
}

.sw-lap {
    flex-direction: row;
    justify-content: space-between;
    padding: 3px 8px;
    font-family: 'Courier New', monospace;
    font-size: 0.8em;
    color: var(--text-green);
    opacity: 0.8;
    border-bottom: 1px solid var(--bg-secondary);
}

.sw-lap-num {
    color: var(--text-orange);
}

@media (hover: hover) {
    .sw-btn:hover { box-shadow: 0 0 6px var(--text-green); }
    .sw-btn-stop:hover { box-shadow: 0 0 6px var(--text-red); }
    .sw-btn-lap:hover { box-shadow: 0 0 6px var(--text-orange); }
    .sw-btn-reset:hover { box-shadow: 0 0 6px var(--text-red); }
}

.theme-light .sw-display { text-shadow: none; }
`;

export default {
    getButtonDataId() { return 'stopwatch'; },
    getInstanceName(_config, tFn) { return tFn('mods.stopwatch.name'); },
    getIconUrl() { return SW_ICON; },

    async init(ctx) {
        if (!document.getElementById('sw-mod-style')) {
            const style = document.createElement('style');
            style.id = 'sw-mod-style';
            style.textContent = SW_CSS;
            document.head.appendChild(style);
        }

        // Runtime state (survives shelf close, lost on page refresh)
        this._running = false;
        this._elapsed = 0;       // ms accumulated before current run
        this._startedAt = 0;     // timestamp of current run start
        this._intervalId = null;
        this._laps = [];

        this._tFn = ctx.i18n.t;
        this._buildShelf(ctx);
    },

    async activate(ctx) {
        this._tFn = ctx.i18n.t;
        this._buildShelf(ctx);
        this._updateDisplay();
        this._updateButtons();
    },

    async deactivate() {},

    async checkHealth() { return 'online'; },
    destroy() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    },

    // ── Shelf ──

    _buildShelf(ctx) {
        if (this._displayEl) return;

        const shelf = ctx.ui.getShelfElement();
        if (!shelf) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'sw-wrapper';

        const display = document.createElement('div');
        display.className = 'sw-display';
        display.textContent = '00:00.00';

        const controls = document.createElement('div');
        controls.className = 'sw-controls';

        const btnStart = document.createElement('button');
        btnStart.className = 'sw-btn';
        btnStart.addEventListener('click', () => this._toggle());

        const btnLap = document.createElement('button');
        btnLap.className = 'sw-btn sw-btn-lap';
        btnLap.addEventListener('click', () => this._lap());

        const btnReset = document.createElement('button');
        btnReset.className = 'sw-btn sw-btn-reset';
        btnReset.addEventListener('click', () => this._reset());

        controls.appendChild(btnStart);
        controls.appendChild(btnLap);
        controls.appendChild(btnReset);

        const lapsContainer = document.createElement('div');
        lapsContainer.className = 'sw-laps';

        wrapper.appendChild(display);
        wrapper.appendChild(controls);
        wrapper.appendChild(lapsContainer);
        shelf.appendChild(wrapper);

        this._displayEl = display;
        this._btnStart = btnStart;
        this._btnLap = btnLap;
        this._btnReset = btnReset;
        this._lapsEl = lapsContainer;

        this._updateButtons();
        this._updateDisplay();
    },

    // ── Timer Logic ──

    _now() {
        if (!this._running) return this._elapsed;
        return this._elapsed + (Date.now() - this._startedAt);
    },

    _toggle() {
        if (this._running) {
            this._stop();
        } else {
            this._start();
        }
    },

    _start() {
        if (this._running) return;
        this._running = true;
        this._startedAt = Date.now();
        this._intervalId = setInterval(() => this._updateDisplay(), 30);
        this._updateButtons();
    },

    _stop() {
        if (!this._running) return;
        this._elapsed += Date.now() - this._startedAt;
        this._running = false;
        clearInterval(this._intervalId);
        this._intervalId = null;
        this._updateDisplay();
        this._updateButtons();
    },

    _lap() {
        if (!this._running) return;
        const total = this._now();
        const prev = this._laps.length > 0 ? this._laps[0].total : 0;
        this._laps.unshift({ total, split: total - prev });
        this._renderLaps();
    },

    _reset() {
        this._stop();
        this._elapsed = 0;
        this._startedAt = 0;
        this._laps = [];
        this._updateDisplay();
        this._updateButtons();
        if (this._lapsEl) this._lapsEl.innerHTML = '';
    },

    // ── Rendering ──

    _formatTime(ms) {
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        const cs = Math.floor((ms % 1000) / 10);
        return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    },

    _updateDisplay() {
        if (!this._displayEl) return;
        this._displayEl.textContent = this._formatTime(this._now());
        this._displayEl.classList.toggle('running', this._running);
    },

    _updateButtons() {
        if (!this._btnStart) return;
        const t = this._tFn || (k => k);
        if (this._running) {
            this._btnStart.textContent = t('mods.stopwatch.stop');
            this._btnStart.className = 'sw-btn sw-btn-stop';
        } else {
            this._btnStart.textContent = t('mods.stopwatch.start');
            this._btnStart.className = 'sw-btn';
        }
        this._btnLap.textContent = t('mods.stopwatch.lap');
        this._btnReset.textContent = t('mods.stopwatch.reset');
        this._btnLap.disabled = !this._running;
        this._btnLap.style.opacity = this._running ? '1' : '0.4';
    },

    _renderLaps() {
        if (!this._lapsEl) return;
        this._lapsEl.innerHTML = '';
        for (let i = 0; i < this._laps.length; i++) {
            const lap = this._laps[i];
            const row = document.createElement('div');
            row.className = 'sw-lap';
            row.innerHTML = `<span class="sw-lap-num">#${this._laps.length - i}</span>`
                + `<span>${this._formatTime(lap.split)}</span>`
                + `<span>${this._formatTime(lap.total)}</span>`;
            this._lapsEl.appendChild(row);
        }
    },
};
