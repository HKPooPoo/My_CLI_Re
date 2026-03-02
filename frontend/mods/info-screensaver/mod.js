/**
 * Info Screensaver MOD — Code module (data in manifest.json)
 *
 * CONTAINERIZATION: init() only loads CSS. All functional logic is
 * gated behind instance existence — nothing runs until a user adds
 * an instance via the MOD catalog.
 */

import { PLATFORM_VERSION } from '../../javascript/version.js';
// BYPASS: Direct import — no ctx.query.getInstances() API
import { getInstances } from '../mod-loader.js';
// BYPASS: Direct import — t() needed in _buildDashboard and _refreshData outside activate context
import { t } from '../../javascript/i18n.js';

// --- Pure helper functions (no mutable state) ---

function _buildDashboard(config) {
    const layer = document.createElement('div');
    layer.id = 'info-screensaver-layer';

    const modCount = getInstances().length;

    const rows = [];
    rows.push(_row('title', `MY CLI Re v${PLATFORM_VERSION}`));

    if (config.showLlm !== false) {
        const llmRow = _row('llm', '');
        llmRow.style.display = 'none';
        rows.push(llmRow);
    }
    if (config.showMods !== false) {
        rows.push(_row('mods', `MODS: ${modCount} ${t('mods.infoScreensaver.active')}`));
    }
    if (config.showClock !== false) {
        rows.push(_row('clock', _formatTime()));
    }

    const box = document.createElement('div');
    box.className = 'is-box';

    const top = document.createElement('div');
    top.className = 'is-border is-border-top';
    top.textContent = '\u2554' + '\u2550'.repeat(38) + '\u2557';

    const bottom = document.createElement('div');
    bottom.className = 'is-border is-border-bottom';
    bottom.textContent = '\u255A' + '\u2550'.repeat(38) + '\u255D';

    box.appendChild(top);
    rows.forEach(r => box.appendChild(r));
    box.appendChild(bottom);

    layer.appendChild(box);
    return layer;
}

function _row(id, text, status) {
    const row = document.createElement('div');
    row.className = 'is-row';
    row.dataset.isRow = id;

    const left = document.createElement('div');
    left.className = 'is-pipe';
    left.textContent = '\u2551  ';

    const content = document.createElement('div');
    content.className = 'is-content';
    if (status) content.classList.add(`is-${status}`);
    content.textContent = text;

    const right = document.createElement('div');
    right.className = 'is-pipe is-pipe-right';
    right.textContent = '\u2551';

    row.appendChild(left);
    row.appendChild(content);
    row.appendChild(right);
    return row;
}

function _formatTime() {
    const d = new Date();
    return d.toTimeString().slice(0, 8);
}

// --- Template ---

export default {
    getButtonDataId(_config) {
        return 'info-screensaver';
    },

    getInstanceName(_config, tFn) {
        return tFn('mods.infoScreensaver.name');
    },

    getDeployPages(_config) {
        return [];
    },

    // --- Lifecycle ---

    async init(_ctx) {
        if (!document.getElementById('info-screensaver-css')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.id = 'info-screensaver-css';
            link.href = '/mods/info-screensaver/screensaver.css';
            document.head.appendChild(link);
        }

        // BYPASS: Direct window.addEventListener — no ctx.events.onPersistent() for init-time listeners
        this._onInstanceAdded = ({ detail }) => {
            if (detail.instance.templateId === 'info-screensaver') this._startListening();
        };
        this._onInstanceRemoved = ({ detail }) => {
            if (detail.templateId === 'info-screensaver') this._stopListening();
        };
        window.addEventListener('mods:instanceAdded', this._onInstanceAdded);
        window.addEventListener('mods:instanceRemoved', this._onInstanceRemoved);

        if (this._getInstance()) this._startListening();
    },

    async activate(_ctx) {},
    async deactivate(_ctx) {},

    onConfigChange(_ctx, _key, _value) {
        if (!this._running) return;
        if (this._layer) {
            const inst = this._getInstance();
            if (inst) this._show(inst.config);
        }
    },

    async checkHealth(_instanceConfig) { return 'online'; },

    destroy(_ctx) {
        this._stopListening();
        if (this._onInstanceAdded) window.removeEventListener('mods:instanceAdded', this._onInstanceAdded);
        if (this._onInstanceRemoved) window.removeEventListener('mods:instanceRemoved', this._onInstanceRemoved);
        this._onInstanceAdded = null;
        this._onInstanceRemoved = null;
    },

    // --- Private methods (use mutable state on `this`) ---

    _getInstance() {
        return getInstances().find(i => i.templateId === 'info-screensaver') || null;
    },

    _startClock() {
        this._stopClock();
        this._clockInterval = setInterval(() => {
            if (!this._layer) return;
            const clockRow = this._layer.querySelector('[data-is-row="clock"] .is-content');
            if (clockRow) clockRow.textContent = _formatTime();
        }, 1000);
    },

    _stopClock() {
        if (this._clockInterval) {
            clearInterval(this._clockInterval);
            this._clockInterval = null;
        }
    },

    _refreshData() {
        if (!this._layer) return;
        const modsEl = this._layer.querySelector('[data-is-row="mods"] .is-content');
        if (modsEl) {
            modsEl.textContent = `MODS: ${getInstances().length} ${t('mods.infoScreensaver.active')}`;
        }
    },

    _startRefresh() {
        this._stopRefresh();
        this._refreshInterval = setInterval(() => this._refreshData(), 15000);
    },

    _stopRefresh() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
    },

    _startLlmListener() {
        this._stopLlmListener();
        // BYPASS: Direct window.addEventListener — llm:progress is a convention-based event, no ctx in this scope
        this._onLlmProgress = ({ detail }) => {
            const row = this._layer?.querySelector('[data-is-row="llm"]');
            if (!row) return;
            const content = row.querySelector('.is-content');
            if (!content) return;

            if (detail.status === 'progress') {
                row.style.display = '';
                content.textContent = `LLM: ${detail.text}`;
                content.className = 'is-content is-loading';
                content.dataset.loading = 'true';
            } else if (detail.status === 'ready') {
                row.style.display = '';
                content.textContent = `LLM: ${detail.model} \u2713`;
                content.className = 'is-content is-online';
                delete content.dataset.loading;
            } else if (detail.status === 'error') {
                row.style.display = '';
                content.textContent = `LLM: ${detail.text}`;
                content.className = 'is-content is-offline';
                delete content.dataset.loading;
            }
        };
        window.addEventListener('llm:progress', this._onLlmProgress);
    },

    _stopLlmListener() {
        if (this._onLlmProgress) {
            window.removeEventListener('llm:progress', this._onLlmProgress);
            this._onLlmProgress = null;
        }
    },

    // BYPASS: Direct DOM access — #press-start-overlay is framework-owned, no ctx.ui API for screensaver layer
    _show(config) {
        const overlay = document.getElementById('press-start-overlay');
        if (!overlay) return;

        this._hide();

        this._layer = _buildDashboard(config);
        overlay.appendChild(this._layer);

        const label = document.getElementById('press-start-label');
        if (label) label.style.display = 'none';

        if (config.showClock !== false) this._startClock();
        this._startRefresh();
        this._startLlmListener();
    },

    _hide() {
        this._stopClock();
        this._stopRefresh();
        this._stopLlmListener();
        if (this._layer && this._layer.parentNode) {
            this._layer.parentNode.removeChild(this._layer);
        }
        this._layer = null;

        const label = document.getElementById('press-start-label');
        if (label) label.style.display = '';
    },

    _startListening() {
        if (this._running) return;
        this._running = true;

        const getConfig = () => {
            const inst = this._getInstance();
            return inst ? inst.config : {};
        };

        // BYPASS: Direct window.addEventListener — no ctx.events.onPersistent() for init-time listeners
        this._onActivated = () => {
            if (!this._getInstance()) return;
            this._show(getConfig());
        };
        this._onDeactivated = () => { this._hide(); };

        window.addEventListener('screensaver:activated', this._onActivated);
        window.addEventListener('screensaver:deactivated', this._onDeactivated);

        // BYPASS: Direct DOM access — check if screensaver overlay is already visible
        const overlay = document.getElementById('press-start-overlay');
        if (overlay && overlay.style.display !== 'none') {
            this._show(getConfig());
        }
    },

    _stopListening() {
        this._running = false;
        this._hide();
        if (this._onActivated) window.removeEventListener('screensaver:activated', this._onActivated);
        if (this._onDeactivated) window.removeEventListener('screensaver:deactivated', this._onDeactivated);
        this._onActivated = null;
        this._onDeactivated = null;
    },
};
