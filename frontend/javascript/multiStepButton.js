/**
 * MultiStepButton — standardised countdown-confirm button
 * =================================================================
 * N-step pattern (N = total clicks required to fire):
 *   1-step (instant): `Kill` → fire
 *   2-step:           `Kill` → `Kill!` → fire
 *   3-step:           `Kill` → `Killx2` → `Kill!` → fire
 *   4-step:           `Kill` → `Killx3` → `Killx2` → `Kill!` → fire
 *   N-step:           `Kill` → `Killx(N-1)` → … → `Killx2` → `Kill!` → fire
 *
 * API
 * ---
 *   new MultiStepButton(el, {
 *     action,              // async fn — executes on the final click
 *     sound,               // audio played on every click (optional)
 *     fireSound,           // override for final click (defaults to sound)
 *     steps: 1,            // int ≥1 or () => int. 1 = instant, N = N-step countdown.
 *     dynamicLabel: false, // if true, re-read base label from el.textContent on each arming
 *     timeout: 3000,       // ms before armed state auto-resets
 *   });
 *
 *   btn.reset();           // public — force back to step 0
 *
 * Label sources
 * -------------
 *   Static mode (default): initial label from `data-i18n` attribute via t(key).
 *     Intermediate step with `remaining` clicks left:
 *       - if remaining ≥ 2: try locale `{key}X{remaining}`, fall back to `{base}x{remaining}`
 *       - if remaining === 1 (final): try locale `{key}Final`, fall back to `{base}!`
 *
 *   Dynamic mode (dynamicLabel: true): initial label read from el.textContent each
 *   time arming starts. Intermediate/final use the formula (no locale lookup) so the
 *   label tracks whatever external code last set.
 *
 *   External callers that mutate textContent (e.g. BB CHECKOUT/SWITCH, BB DROP/CLEAN)
 *   MUST invoke `btn.reset()` BEFORE changing textContent, otherwise the armed state
 *   and cached base label become stale (you would get "SWITCHx2" but the action is
 *   the old armed CHECKOUT).
 *
 * Dynamic step count
 * ------------------
 *   Pass `steps` as a function when different states of the same button need
 *   different depth. Example: BB's triple-purpose DROP button wants
 *   3-step confirmation for CLEAN but 1-click (instant) for DROP and DELETE:
 *     steps: () => currentDropAction === 'clean' ? 3 : 1
 *   The value is resolved at click time, so it can read external state.
 *
 * Dependencies: audio.js, i18n.js
 * =================================================================
 */

import { playAudio } from "./audio.js";
import { t } from "./i18n.js";

export class MultiStepButton {
    /**
     * @param {HTMLElement} el
     * @param {Object} opts
     */
    constructor(el, opts = {}) {
        if (!el) return;
        this.el = el;
        this.action = opts.action || (() => {});
        this.sound = opts.sound || null;
        this.fireSound = opts.fireSound !== undefined ? opts.fireSound : this.sound;
        this.timeout = opts.timeout || 3000;
        this.dynamicLabel = !!opts.dynamicLabel;
        this._stepsConfig = opts.steps !== undefined ? opts.steps : 1;

        this.i18nKey = this.el.getAttribute('data-i18n') || null;
        this.baseLabel = this._computeBaseLabel();

        this.step = 0;
        this.busy = false;
        this.timer = null;

        // Static buttons: re-capture base label when i18n re-renders (locale loaded
        // after construction, or user switched locale). Dynamic buttons rely on
        // external state updaters to set textContent, so no i18n hook needed.
        if (!this.dynamicLabel && this.i18nKey) {
            window.addEventListener('i18n:ready', () => {
                if (this.step === 0) {
                    this.baseLabel = t(this.i18nKey);
                    this.el.textContent = this.baseLabel;
                }
            });
        }

        this.el.addEventListener('click', (e) => {
            e.preventDefault();
            this._onClick();
        });
    }

    // =================================================================
    //  Public API
    // =================================================================

    /** Force the button back to step 0 and restore the base label. */
    reset() {
        if (this.step === 0 && !this.timer) return;
        this._clearTimer();
        this.step = 0;
        this.el.classList.remove('btn-armed');
        this.el.textContent = this.baseLabel;
    }

    // =================================================================
    //  Internal
    // =================================================================

    _resolveSteps() {
        const cfg = this._stepsConfig;
        const n = typeof cfg === 'function' ? cfg() : cfg;
        return Math.max(1, parseInt(n, 10) || 1);
    }

    _computeBaseLabel() {
        if (this.dynamicLabel) return this.el.textContent || '';
        if (this.i18nKey) return t(this.i18nKey);
        return this.el.textContent || '';
    }

    /**
     * Label for the given step within an N-step flow.
     *   step 0              → base
     *   step k (remaining = N-k):
     *     remaining >= 2    → "{base}x{remaining}" (or locale `{key}X{remaining}`)
     *     remaining === 1   → "{base}!"            (or locale `{key}Final`)
     */
    _labelAt(step, total) {
        if (step === 0) return this.baseLabel;
        const remaining = total - step;
        if (remaining === 1) {
            if (!this.dynamicLabel && this.i18nKey) {
                const key = this.i18nKey + 'Final';
                const str = t(key);
                if (str !== key) return str;
            }
            return this.baseLabel + '!';
        }
        if (!this.dynamicLabel && this.i18nKey) {
            const key = `${this.i18nKey}X${remaining}`;
            const str = t(key);
            if (str !== key) return str;
        }
        return this.baseLabel + 'x' + remaining;
    }

    _onClick() {
        if (this.busy) return;

        const total = this._resolveSteps();

        // Instant (steps: 1) — fire without arming.
        if (total <= 1) {
            if (this.fireSound) playAudio(this.fireSound);
            this._fire();
            return;
        }

        // Start of arming — refresh base label (handles dynamic-mode textContent
        // changes and any locale swap since construction).
        if (this.step === 0) {
            this.baseLabel = this._computeBaseLabel();
        }

        this.step += 1;

        if (this.step < total) {
            if (this.sound) playAudio(this.sound);
            this.el.textContent = this._labelAt(this.step, total);
            this.el.classList.add('btn-armed');
            this._startTimer();
        } else {
            if (this.fireSound) playAudio(this.fireSound);
            this._clearTimer();
            this.step = 0;
            this.el.classList.remove('btn-armed');
            this.el.textContent = this.baseLabel;
            this._fire();
        }
    }

    async _fire() {
        this.busy = true;
        this.el.setAttribute('aria-busy', 'true');
        try {
            await this.action();
        } catch {
            // Callers own their error UX (BBMessage / toasts / logging)
        } finally {
            this.busy = false;
            this.el.removeAttribute('aria-busy');
        }
    }

    _startTimer() {
        this._clearTimer();
        this.timer = setTimeout(() => this.reset(), this.timeout);
    }

    _clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
