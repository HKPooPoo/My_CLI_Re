/**
 * ASCII Animator MOD — textmode.js WebGL2 Visual Decoration
 * =================================================================
 * Four togglable visual features controlled entirely via config:
 *   1. Matrix Rain  — interactive WebGL2 rain in screensaver overlay
 *   2. Perlin Bg    — animated noise field behind page content
 *   3. Mouse Light  — cursor flashlight glow effect (CSS-based)
 *   4. Toast Spinner — braille loading animation on toasts (DOM-based)
 *
 * No feature button. No shelf panel. Pure background decoration.
 * Engine: textmode.js (zero-dependency, framework-agnostic, WebGL2)
 *
 * CONTAINERIZATION: init() only loads CSS. All functional logic is
 * gated behind instance existence — nothing runs until a user adds
 * an instance via the MOD catalog.
 * =================================================================
 */

import { createMatrixRain } from './layers/matrix-rain.js';
import { createPerlinBg } from './layers/perlin-bg.js';
import { createMouseLight } from './layers/mouse-light.js';
import { createToastSpinner } from './layers/toast-spinner.js';
import { getInstances } from '../mod-loader.js';

let _textmodeLoaded = false;

async function _ensureTextmode() {
    if (_textmodeLoaded || window.textmode) { _textmodeLoaded = true; return true; }
    try {
        const script = document.createElement('script');
        script.src = '/javascript/vendor/textmode.js';
        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        _textmodeLoaded = true;
        return true;
    } catch (e) {
        console.error('[ascii-animator] Failed to load textmode.js:', e);
        return false;
    }
}

function _getInstance() {
    return getInstances().find(i => i.templateId === 'ascii-animator') || null;
}

function _getConfig() {
    const inst = _getInstance();
    return inst ? inst.config : null;
}

export default {
    // ===================== Identity =====================
    id: 'ascii-animator',
    group: 'decoration',
    nameKey: 'mods.asciiAnimator.name',
    descriptionKey: 'mods.asciiAnimator.desc',

    // ===================== Metadata =====================
    version: '1.0.0',
    minApiVersion: 1,
    author: '',
    warnWith: ['light-theme'],

    // ===================== Instance Architecture =====================
    maxInstances: 1,

    getButtonDataId(_config) {
        return 'ascii-animator';
    },

    getInstanceName(_config, tFn) {
        return tFn('mods.asciiAnimator.name');
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
        // --- Matrix Rain ---
        { key: 'matrixRain', type: 'toggle', labelKey: 'mods.asciiAnimator.matrixRain', default: true },
        { key: 'rainSpeed', type: 'range', labelKey: 'mods.asciiAnimator.rainSpeed',
          min: 1, max: 10, step: 1, default: 5, showWhen: { key: 'matrixRain', value: true } },
        { key: 'rainDensity', type: 'range', labelKey: 'mods.asciiAnimator.rainDensity',
          min: 1, max: 10, step: 1, default: 5, showWhen: { key: 'matrixRain', value: true } },

        // --- Perlin Noise Background ---
        { key: 'perlinBg', type: 'toggle', labelKey: 'mods.asciiAnimator.perlinBg', default: false },
        { key: 'perlinOpacity', type: 'range', labelKey: 'mods.asciiAnimator.perlinOpacity',
          min: 3, max: 30, step: 1, default: 8, showWhen: { key: 'perlinBg', value: true } },
        { key: 'perlinSpeed', type: 'range', labelKey: 'mods.asciiAnimator.perlinSpeed',
          min: 1, max: 10, step: 1, default: 3, showWhen: { key: 'perlinBg', value: true } },

        // --- Mouse Light ---
        { key: 'mouseLight', type: 'toggle', labelKey: 'mods.asciiAnimator.mouseLight', default: false },
        { key: 'lightRadius', type: 'range', labelKey: 'mods.asciiAnimator.lightRadius',
          min: 3, max: 15, step: 1, default: 8, showWhen: { key: 'mouseLight', value: true } },

        // --- Toast Spinner ---
        { key: 'toastAnim', type: 'toggle', labelKey: 'mods.asciiAnimator.toastAnim', default: true },
    ],

    // ===================== Lifecycle =====================

    /**
     * init() is called once per template at boot — regardless of instances.
     * Only load CSS here. All functional logic waits for instance existence.
     */
    async init(_ctx) {
        if (!document.getElementById('ascii-animator-css')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.id = 'ascii-animator-css';
            link.href = '/mods/ascii-animator/ascii-animator.css';
            document.head.appendChild(link);
        }

        // Listen for instance add/remove to start/stop all layers
        this._onInstanceAdded = ({ detail }) => {
            if (detail.instance.templateId === 'ascii-animator') this._startAll();
        };
        this._onInstanceRemoved = ({ detail }) => {
            if (detail.templateId === 'ascii-animator') this._stopAll();
        };
        window.addEventListener('mods:instanceAdded', this._onInstanceAdded);
        window.addEventListener('mods:instanceRemoved', this._onInstanceRemoved);

        // If instance already exists at boot (persisted from previous session), start
        if (_getInstance()) this._startAll();
    },

    /** Start all layers based on current config. Called when instance is added. */
    async _startAll() {
        if (this._running) return;
        this._running = true;

        const config = _getConfig();
        if (!config) return;

        // Toast spinner
        if (config.toastAnim !== false && !this._toastSpinner) {
            this._toastSpinner = createToastSpinner();
        }

        // Mouse light
        if (config.mouseLight && !this._mouseLight) {
            this._mouseLight = createMouseLight(config);
        }

        // Load textmode.js if any WebGL layer is needed
        const needsTextmode = config.matrixRain !== false || config.perlinBg;
        if (needsTextmode) await _ensureTextmode();

        // Perlin background
        if (config.perlinBg && _textmodeLoaded && !this._perlinBg) {
            this._perlinBg = createPerlinBg(config);
        }

        // Matrix rain — screensaver events
        this._onActivated = async () => {
            const c = _getConfig();
            if (!c || c.matrixRain === false || this._matrixRain) return;
            if (!_textmodeLoaded) await _ensureTextmode();
            if (!_textmodeLoaded) return;
            const overlay = document.getElementById('press-start-overlay');
            if (overlay) this._matrixRain = createMatrixRain(overlay, c);
        };

        this._onDeactivated = () => {
            if (this._matrixRain) {
                this._matrixRain.destroy();
                this._matrixRain = null;
            }
        };

        window.addEventListener('screensaver:activated', this._onActivated);
        window.addEventListener('screensaver:deactivated', this._onDeactivated);

        // If screensaver already visible, start rain now
        const overlay = document.getElementById('press-start-overlay');
        if (overlay && overlay.style.display !== 'none' && config.matrixRain !== false && _textmodeLoaded) {
            this._matrixRain = createMatrixRain(overlay, config);
        }
    },

    /** Stop all layers. Called when instance is removed. */
    _stopAll() {
        this._running = false;

        if (this._matrixRain) { this._matrixRain.destroy(); this._matrixRain = null; }
        if (this._perlinBg) { this._perlinBg.destroy(); this._perlinBg = null; }
        if (this._mouseLight) { this._mouseLight.destroy(); this._mouseLight = null; }
        if (this._toastSpinner) { this._toastSpinner.destroy(); this._toastSpinner = null; }

        if (this._onActivated) window.removeEventListener('screensaver:activated', this._onActivated);
        if (this._onDeactivated) window.removeEventListener('screensaver:deactivated', this._onDeactivated);
        this._onActivated = null;
        this._onDeactivated = null;
    },

    async activate(_ctx) {},
    async deactivate(_ctx) {},

    onConfigChange(_ctx, key, value) {
        if (!this._running) return;
        const config = _getConfig();
        if (!config) return;

        // --- Matrix Rain toggle ---
        if (key === 'matrixRain') {
            if (value && !this._matrixRain) {
                const overlay = document.getElementById('press-start-overlay');
                if (overlay && overlay.style.display !== 'none') {
                    _ensureTextmode().then(() => {
                        if (_textmodeLoaded) this._matrixRain = createMatrixRain(overlay, config);
                    });
                }
            } else if (!value && this._matrixRain) {
                this._matrixRain.destroy();
                this._matrixRain = null;
            }
        }
        if ((key === 'rainSpeed' || key === 'rainDensity') && this._matrixRain) {
            this._matrixRain.updateConfig(key, value);
        }

        // --- Perlin Background toggle ---
        if (key === 'perlinBg') {
            if (value && !this._perlinBg) {
                _ensureTextmode().then(() => {
                    if (_textmodeLoaded) this._perlinBg = createPerlinBg(config);
                });
            } else if (!value && this._perlinBg) {
                this._perlinBg.destroy();
                this._perlinBg = null;
            }
        }
        if ((key === 'perlinOpacity' || key === 'perlinSpeed') && this._perlinBg) {
            this._perlinBg.updateConfig(key, value);
        }

        // --- Mouse Light toggle ---
        if (key === 'mouseLight') {
            if (value && !this._mouseLight) {
                this._mouseLight = createMouseLight(config);
            } else if (!value && this._mouseLight) {
                this._mouseLight.destroy();
                this._mouseLight = null;
            }
        }
        if (key === 'lightRadius' && this._mouseLight) {
            this._mouseLight.updateConfig(key, value);
        }

        // --- Toast Spinner toggle ---
        if (key === 'toastAnim') {
            if (value && !this._toastSpinner) {
                this._toastSpinner = createToastSpinner();
            } else if (!value && this._toastSpinner) {
                this._toastSpinner.destroy();
                this._toastSpinner = null;
            }
        }
    },

    async checkHealth(_instanceConfig) { return 'online'; },

    destroy(_ctx) {
        this._stopAll();
        if (this._onInstanceAdded) window.removeEventListener('mods:instanceAdded', this._onInstanceAdded);
        if (this._onInstanceRemoved) window.removeEventListener('mods:instanceRemoved', this._onInstanceRemoved);
        this._onInstanceAdded = null;
        this._onInstanceRemoved = null;
    },

    // ===================== Tools / Hooks =====================
    tools: [],
    hooks: [],
};
