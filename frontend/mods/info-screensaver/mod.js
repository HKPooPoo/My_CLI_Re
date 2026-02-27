/**
 * Info Screensaver MOD — System Info Dashboard
 * =================================================================
 * Replaces the "PRESS START" text with a live system dashboard
 * when the screensaver activates (60s idle or initial page load).
 *
 * Data sources (read-only, yellow-zone):
 *   - User/title: localStorage
 *   - DB status: #db-status-display DOM
 *   - MOD count: mod-loader getInstances()
 *   - Version: PLATFORM_VERSION
 *   - Clock: Date
 *
 * CONTAINERIZATION: init() only loads CSS. All functional logic is
 * gated behind instance existence — nothing runs until a user adds
 * an instance via the MOD catalog.
 * =================================================================
 */

import { PLATFORM_VERSION } from '../../javascript/version.js';
import { getInstances } from '../mod-loader.js';
import { t } from '../../javascript/i18n.js';

let _clockInterval = null;
let _layer = null;
let _onActivated = null;
let _onDeactivated = null;
let _running = false;

function _getInstance() {
    return getInstances().find(i => i.templateId === 'info-screensaver') || null;
}

function _buildDashboard(config) {
    const layer = document.createElement('div');
    layer.id = 'info-screensaver-layer';

    // Gather data
    const user = localStorage.getItem('currentUser') || '\u2014';
    const title = localStorage.getItem('currentTitle') || '';
    // BYPASS: reading DOM for DB status — no framework API for this
    const dbEl = document.getElementById('db-status-display');
    const dbText = dbEl ? dbEl.textContent.trim() : '\u2014';
    const dbOnline = dbText.toLowerCase().includes('online') || dbText.toLowerCase().includes('connected');
    const modCount = getInstances().length;

    // Build rows
    const rows = [];
    rows.push(_row('title', `MY CLI Re v${PLATFORM_VERSION}`));

    if (config.showUser !== false) {
        const userLine = title ? `${user} [${title}]` : user;
        rows.push(_row('user', `USER: ${userLine}`));
    }
    if (config.showDb !== false) {
        const indicator = dbOnline ? '\u25CF ONLINE' : '\u25CB OFFLINE';
        rows.push(_row('db', `DB:   ${indicator}`, dbOnline ? 'online' : 'offline'));
    }
    if (config.showMods !== false) {
        rows.push(_row('mods', `MODS: ${modCount} ${t('mods.infoScreensaver.active')}`));
    }
    if (config.showClock !== false) {
        rows.push(_row('clock', _formatTime()));
    }

    // Box frame
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
    return d.toTimeString().slice(0, 8); // HH:MM:SS
}

function _startClock() {
    _stopClock();
    _clockInterval = setInterval(() => {
        if (!_layer) return;
        const clockRow = _layer.querySelector('[data-is-row="clock"] .is-content');
        if (clockRow) clockRow.textContent = _formatTime();
    }, 1000);
}

function _stopClock() {
    if (_clockInterval) {
        clearInterval(_clockInterval);
        _clockInterval = null;
    }
}

function _show(config) {
    const overlay = document.getElementById('press-start-overlay');
    if (!overlay) return;

    _hide(); // Clean previous

    _layer = _buildDashboard(config);
    overlay.appendChild(_layer);

    // Hide the PRESS START label
    const label = document.getElementById('press-start-label');
    if (label) label.style.display = 'none';

    if (config.showClock !== false) _startClock();
}

function _hide() {
    _stopClock();
    if (_layer && _layer.parentNode) {
        _layer.parentNode.removeChild(_layer);
    }
    _layer = null;

    // Restore PRESS START label
    const label = document.getElementById('press-start-label');
    if (label) label.style.display = '';
}

function _startListening() {
    if (_running) return;
    _running = true;

    const getConfig = () => {
        const inst = _getInstance();
        return inst ? inst.config : {};
    };

    _onActivated = () => {
        if (!_getInstance()) return; // Guard: instance may have been removed
        _show(getConfig());
    };
    _onDeactivated = () => { _hide(); };

    window.addEventListener('screensaver:activated', _onActivated);
    window.addEventListener('screensaver:deactivated', _onDeactivated);

    // If screensaver is already visible, show immediately
    const overlay = document.getElementById('press-start-overlay');
    if (overlay && overlay.style.display !== 'none') {
        _show(getConfig());
    }
}

function _stopListening() {
    _running = false;
    _hide();
    if (_onActivated) window.removeEventListener('screensaver:activated', _onActivated);
    if (_onDeactivated) window.removeEventListener('screensaver:deactivated', _onDeactivated);
    _onActivated = null;
    _onDeactivated = null;
}

export default {
    // ===================== Identity =====================
    id: 'info-screensaver',
    group: 'screensaver',
    nameKey: 'mods.infoScreensaver.name',
    descriptionKey: 'mods.infoScreensaver.desc',

    // ===================== Metadata =====================
    version: '1.0.0',
    minApiVersion: 1,
    author: '',

    // ===================== Instance Architecture =====================
    maxInstances: 1,

    getButtonDataId(_config) {
        return 'info-screensaver';
    },

    getInstanceName(_config, tFn) {
        return tFn('mods.infoScreensaver.name');
    },

    defaultInstances: [],

    // ===================== Feature Integration =====================
    shelfPanelId: null,
    pages: {},

    getDeployPages(_config) {
        return [];
    },

    // ===================== Providers =====================
    providers: [],

    // ===================== Config Schema =====================
    configSchema: [
        { key: 'showUser',  type: 'toggle', labelKey: 'mods.infoScreensaver.showUser',  default: true },
        { key: 'showDb',    type: 'toggle', labelKey: 'mods.infoScreensaver.showDb',    default: true },
        { key: 'showMods',  type: 'toggle', labelKey: 'mods.infoScreensaver.showMods',  default: true },
        { key: 'showClock', type: 'toggle', labelKey: 'mods.infoScreensaver.showClock', default: true },
    ],

    // ===================== Lifecycle =====================

    /**
     * init() is called once per template at boot — regardless of instances.
     * Only load CSS here. All functional logic waits for instance existence.
     */
    async init(_ctx) {
        if (!document.getElementById('info-screensaver-css')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.id = 'info-screensaver-css';
            link.href = '/mods/info-screensaver/screensaver.css';
            document.head.appendChild(link);
        }

        // Listen for instance add/remove
        this._onInstanceAdded = ({ detail }) => {
            if (detail.instance.templateId === 'info-screensaver') _startListening();
        };
        this._onInstanceRemoved = ({ detail }) => {
            if (detail.templateId === 'info-screensaver') _stopListening();
        };
        window.addEventListener('mods:instanceAdded', this._onInstanceAdded);
        window.addEventListener('mods:instanceRemoved', this._onInstanceRemoved);

        // If instance already exists at boot (persisted), start
        if (_getInstance()) _startListening();
    },

    async activate(_ctx) {},
    async deactivate(_ctx) {},

    onConfigChange(_ctx, _key, _value) {
        if (!_running) return;
        // Re-render dashboard if currently visible
        if (_layer) {
            const inst = _getInstance();
            if (inst) _show(inst.config);
        }
    },

    async checkHealth(_instanceConfig) { return 'online'; },

    destroy(_ctx) {
        _stopListening();
        if (this._onInstanceAdded) window.removeEventListener('mods:instanceAdded', this._onInstanceAdded);
        if (this._onInstanceRemoved) window.removeEventListener('mods:instanceRemoved', this._onInstanceRemoved);
        this._onInstanceAdded = null;
        this._onInstanceRemoved = null;
    },

    // ===================== Tools / Hooks =====================
    tools: [],
    hooks: [],
};
