/**
 * MultiStepButton Component
 * =================================================================
 * Two modes:
 *
 * 1. INSTANT — single click, fires immediately, no cooldown.
 *    new MultiStepButton(el, { sound, action })
 *
 * 2. CONFIRM — click to arm, click again to fire. Auto-resets on timeout.
 *    new MultiStepButton(el, { sound, action, confirm: true })
 *    new MultiStepButton(el, { sound, action, confirm: true, confirmLabel: "SURE?" })
 *    new MultiStepButton(el, { sound, action, confirm: true, confirmLabel: "SURE?", confirmSound: "warn.mp3" })
 *
 * Options:
 *   sound         — audio file to play on primary click
 *   action        — async callback executed on fire
 *   confirm       — if true, requires a second click to execute
 *   confirmLabel  — text shown while armed (default: "SURE?")
 *   confirmSound  — audio played on confirmation click (default: same as sound)
 *   timeout       — ms before armed state auto-resets (default: 3000)
 *
 * During async action execution, the button is disabled to prevent
 * double-fire but remains visually unchanged (no artificial cooldown).
 *
 * Dependencies: audio.js
 * =================================================================
 */

import { playAudio } from "./audio.js";

export class MultiStepButton {
    /**
     * @param {HTMLElement} element
     * @param {Object|Object[]} opts — config object, OR legacy steps array (backward compat)
     * @param {number} [legacyTimeout] — only used for legacy array form
     */
    constructor(element, opts, legacyTimeout) {
        if (!element) return;
        this.el = element;

        // --- Normalize legacy array API into new format ---
        if (Array.isArray(opts)) {
            this._initFromLegacy(opts, legacyTimeout);
            return;
        }

        // --- New unified API ---
        this.sound = opts.sound || null;
        this.action = opts.action || (() => {});
        this.isConfirm = !!opts.confirm;
        this.confirmLabel = opts.confirmLabel || "SURE?";
        this.confirmSound = opts.confirmSound || this.sound;
        this.timeout = opts.timeout || 3000;

        this.originalLabel = this.el.textContent;
        this.armed = false;
        this.busy = false;
        this.timer = null;

        this.el.addEventListener("click", (e) => {
            e.preventDefault();
            this._onClick();
        });
    }

    // =================================================================
    //  Core
    // =================================================================

    _onClick() {
        if (this.busy) return;

        if (!this.isConfirm) {
            // INSTANT mode — fire immediately, no cooldown
            if (this.sound) playAudio(this.sound);
            this._fire();
            return;
        }

        // CONFIRM mode
        if (!this.armed) {
            // First click: arm
            if (this.sound) playAudio(this.sound);
            this._arm();
        } else {
            // Second click: execute
            if (this.confirmSound) playAudio(this.confirmSound);
            this._disarm();
            this._fire();
        }
    }

    _arm() {
        this.armed = true;
        this.el.textContent = this.confirmLabel;
        this.el.classList.add("btn-armed");
        this._startTimer();
    }

    _disarm() {
        this.armed = false;
        this.el.textContent = this.originalLabel;
        this.el.classList.remove("btn-armed");
        this._clearTimer();
    }

    async _fire() {
        this.busy = true;
        this.el.setAttribute("aria-busy", "true");
        try {
            await this.action();
        } catch (err) {
            // Swallow — callers handle their own errors via BBMessage
        } finally {
            this.busy = false;
            this.el.removeAttribute("aria-busy");
        }
    }

    _clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    // =================================================================
    //  Legacy array API — full backward compatibility
    //  Converts old [...steps] into the confirm pattern automatically.
    // =================================================================

    _initFromLegacy(steps, timeout) {
        // Last step is the one with the real action
        const lastStep = steps[steps.length - 1];
        // First step provides the initial label and sound
        const firstStep = steps[0];

        this.originalLabel = firstStep.label || this.el.textContent;
        this.sound = firstStep.sound || null;
        this.action = lastStep.action || (() => {});
        this.confirmLabel = steps.length > 1 ? steps[steps.length - 1].label || "SURE?" : null;
        this.confirmSound = lastStep.sound || this.sound;
        this.timeout = timeout || 3000;

        // Multi-step → confirm mode, single step → instant
        this.isConfirm = steps.length > 1;

        // For >2 steps (like register's 4-step), we simulate the countdown
        this.allSteps = steps.length > 2 ? steps : null;
        this.stepIndex = 0;

        this.armed = false;
        this.busy = false;
        this.timer = null;

        // Set initial label
        this.el.textContent = this.originalLabel;

        this.el.addEventListener("click", (e) => {
            e.preventDefault();
            if (this.allSteps) {
                this._onClickMulti();
            } else {
                this._onClick();
            }
        });
    }

    /**
     * Multi-step countdown (3+ steps, like REGISTER x 3 → x 2 → CONFIRM!)
     */
    _onClickMulti() {
        if (this.busy) return;

        const step = this.allSteps[this.stepIndex];
        if (step.sound) playAudio(step.sound);

        if (this.stepIndex < this.allSteps.length - 1) {
            // Advance to next step
            this.stepIndex++;
            const nextStep = this.allSteps[this.stepIndex];
            this.el.textContent = nextStep.label || this.el.textContent;
            if (this.stepIndex > 0) {
                this.el.classList.add("btn-armed");
            }
            this._startTimer();
        } else {
            // Final step: fire
            this.el.classList.remove("btn-armed");
            this._resetMulti();
            this._fire();
        }
    }

    _resetMulti() {
        this._clearTimer();
        this.stepIndex = 0;
        this.el.textContent = this.originalLabel;
        this.el.classList.remove("btn-armed");
    }

    // Override _disarm for multi-step to reset properly
    _startTimer() {
        this._clearTimer();
        this.timer = setTimeout(() => {
            if (this.allSteps) {
                this._resetMulti();
            } else {
                this._disarm();
            }
        }, this.timeout);
    }
}
