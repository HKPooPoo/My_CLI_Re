/**
 * Theme Engine — Framework module for MOD-driven themes
 * =================================================================
 * Replaces the old hud.js theme toggle. The theme button is hidden
 * by default (display:none in hud.css) and shown only when theme
 * MOD instances exist. Button styling (absolute position, responsive
 * sizing via @media.css) is preserved from the original.
 *
 * Theme MOD templates must declare:
 *   group: 'theme'
 *   getThemeVars(config)    → { '--var-name': 'value', ... }
 *   getThemeClasses(config) → ['class-name', ...]
 *
 * Composability: instances are iterated in order (lowest order first).
 * For CSS vars, later instances overwrite earlier ones (Object.assign).
 * For CSS classes, all are additive (union).
 *
 * State: 'default' (CRT dark) | 'active' (MOD theme applied).
 * Persisted in localStorage['theme-engine-state'].
 *
 * Legacy migration: reads old localStorage['data-theme'] key.
 * If 'light', sets state to 'active' and removes the old key.
 * =================================================================
 */

import { ModState } from './mod-state.js';
import { playAudio } from './audio.js';

const STATE_KEY = 'theme-engine-state';
const LEGACY_KEY = 'data-theme';

export const ThemeEngine = {
    _state: 'default',       // 'default' | 'active'
    _appliedVars: [],        // CSS custom property names currently set
    _appliedClasses: [],     // CSS classes currently added to <html>
    _initialized: false,

    /**
     * Initialize the theme engine. Called once after mods:loaded.
     * Mirrors the original hud.js boot sequence:
     *   1. Read persisted state
     *   2. Apply theme if active
     *   3. Wire click handler on #theme-change-btn
     */
    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Legacy migration: old hud.js localStorage["data-theme"] key
        this._migrateLegacy();

        // Restore persisted state
        const saved = localStorage.getItem(STATE_KEY);
        this._state = (saved === 'active') ? 'active' : 'default';

        // Apply or clear theme based on state
        if (this._state === 'active' && this._getThemeInstances().length > 0) {
            this._applyTheme();
        } else {
            // No theme MODs or state is default — ensure clean slate
            if (this._state === 'active') {
                // State says active but no MODs — reset to default
                this._state = 'default';
                localStorage.setItem(STATE_KEY, 'default');
            }
            this._clearApplied();
        }

        // Show/hide button based on whether theme MODs exist
        this._updateButton();

        // Wire click handler (button is in DOM, styled by hud.css + @media.css)
        const btn = document.getElementById('theme-change-btn');
        if (btn) {
            btn.addEventListener('click', () => this.toggle());
        }

        // Listen for MOD instance changes to re-evaluate
        window.addEventListener('mods:instanceAdded', () => this._onInstanceChange());
        window.addEventListener('mods:instanceRemoved', () => this._onInstanceChange());
        window.addEventListener('mods:configChanged', () => this._onInstanceChange());
        window.addEventListener('mods:reordered', () => this._onInstanceChange());
    },

    /**
     * Toggle between default and active theme.
     * Mirrors the original hud.js click handler:
     *   playAudio → toggle state → apply/remove → persist
     */
    toggle() {
        playAudio('UIPipboyOKPress.mp3');

        if (this._state === 'default') {
            if (this._getThemeInstances().length === 0) return; // No theme MODs — do nothing
            this._state = 'active';
            this._applyTheme();
        } else {
            this._state = 'default';
            this._removeTheme();
        }

        localStorage.setItem(STATE_KEY, this._state);
        window.dispatchEvent(new CustomEvent('theme:changed', {
            detail: { state: this._state }
        }));
    },

    /**
     * Get current theme state.
     * @returns {'default'|'active'}
     */
    getState() {
        return this._state;
    },

    /**
     * Check if any theme MOD instances exist.
     * @returns {boolean}
     */
    hasThemeInstances() {
        return this._getThemeInstances().length > 0;
    },

    // ===================== Internal =====================

    /**
     * Get all instances whose template has group === 'theme', ordered.
     */
    _getThemeInstances() {
        return ModState.getInstances().filter(inst => {
            const tpl = ModState.getTemplate(inst.templateId);
            return tpl?.group === 'theme';
        });
    },

    /**
     * Apply theme: iterate theme MOD instances in order, merge vars + classes.
     */
    _applyTheme() {
        this._clearApplied();

        const instances = this._getThemeInstances();
        if (instances.length === 0) return;

        const mergedVars = {};
        const mergedClasses = new Set();

        for (const inst of instances) {
            const tpl = ModState.getTemplate(inst.templateId);
            if (!tpl) continue;

            if (typeof tpl.getThemeVars === 'function') {
                const vars = tpl.getThemeVars(inst.config);
                if (vars && typeof vars === 'object') {
                    Object.assign(mergedVars, vars);
                }
            }

            if (typeof tpl.getThemeClasses === 'function') {
                const classes = tpl.getThemeClasses(inst.config);
                if (Array.isArray(classes)) {
                    classes.forEach(c => mergedClasses.add(c));
                }
            }
        }

        const root = document.documentElement;

        for (const [prop, value] of Object.entries(mergedVars)) {
            root.style.setProperty(prop, value);
            this._appliedVars.push(prop);
        }

        for (const cls of mergedClasses) {
            root.classList.add(cls);
            this._appliedClasses.push(cls);
        }
    },

    /**
     * Remove theme: strip all applied CSS vars and classes.
     */
    _removeTheme() {
        this._clearApplied();
    },

    /**
     * Clear all previously applied vars, classes, and anti-FOUC residue.
     */
    _clearApplied() {
        const root = document.documentElement;

        for (const prop of this._appliedVars) {
            root.style.removeProperty(prop);
        }
        this._appliedVars = [];

        for (const cls of this._appliedClasses) {
            root.classList.remove(cls);
        }
        this._appliedClasses = [];

        // Defensive: remove known theme classes (handles anti-FOUC residue)
        root.classList.remove('theme-light');
    },

    /**
     * Show/hide the #theme-change-btn.
     * CSS sets display:none by default. JS overrides to 'block' when
     * theme MODs exist, which preserves all @media.css responsive rules
     * (shrink at 768px, off-screen at 128px height).
     */
    _updateButton() {
        const btn = document.getElementById('theme-change-btn');
        if (!btn) return;
        btn.style.display = this.hasThemeInstances() ? 'block' : '';
    },

    /**
     * React to MOD instance add/remove/config/reorder.
     * Update button visibility. If theme is active, re-apply with
     * the new instance set. If all theme MODs removed, revert.
     */
    _onInstanceChange() {
        this._updateButton();

        if (this._state === 'active') {
            if (this._getThemeInstances().length > 0) {
                this._applyTheme();
            } else {
                this._state = 'default';
                localStorage.setItem(STATE_KEY, 'default');
                this._removeTheme();
                window.dispatchEvent(new CustomEvent('theme:changed', {
                    detail: { state: this._state }
                }));
            }
        }
    },

    /**
     * Migrate from old hud.js localStorage["data-theme"] key.
     * Original hud.js stored "dark" or "light". Default was light.
     */
    _migrateLegacy() {
        const old = localStorage.getItem(LEGACY_KEY);
        if (old === null) return;

        // Old "light" = active theme; old "dark" = default CRT
        if (old === 'light') {
            localStorage.setItem(STATE_KEY, 'active');
        }

        localStorage.removeItem(LEGACY_KEY);
    }
};
