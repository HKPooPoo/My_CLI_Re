/**
 * Blackboard Auto-Sync (Multi-Device)
 * =================================================================
 * WhatsApp-style auto-sync: edits auto-commit after 3s debounce,
 * other devices receive WebSocket notification and auto-checkout.
 * Self-echo filtered via per-tab deviceId (sessionStorage).
 * =================================================================
 */

import { BBVCS } from './blackboard-vcs.js';
import { BBMessage } from './blackboard-msg.js';
import { getEcho } from './echo-service.js';
import { t } from './i18n.js';
import * as Settings from './settings.js';

// --- Per-tab device ID (survives refresh within same tab) ---
const DEVICE_ID_KEY = 'bb-sync-device-id';
if (!sessionStorage.getItem(DEVICE_ID_KEY)) {
    sessionStorage.setItem(DEVICE_ID_KEY, crypto.randomUUID());
}

// --- Callbacks wired by blackboard.js ---
let _getState = null;
let _getTextareaValue = null;
let _onRemoteUpdate = null;
let _onBranchListUpdate = null;

// --- Internal state ---
let _commitTimer = null;
let _isCommitting = false;
let _commitPromise = null;
let _pendingRemoteCheckout = false;
let _echoChannel = null;
let _currentUid = null;

function _isAutoSyncEnabled() {
    return Settings.get('bb', 'autoSync') === true;
}

function _isLoggedIn() {
    return !!localStorage.getItem('currentUser');
}

export const BBSync = {
    get deviceId() {
        return sessionStorage.getItem(DEVICE_ID_KEY);
    },

    /**
     * Wire callbacks from blackboard.js.
     * Must be called once after initBoard().
     */
    init({ getState, getTextareaValue, onRemoteUpdate, onBranchListUpdate }) {
        _getState = getState;
        _getTextareaValue = getTextareaValue;
        _onRemoteUpdate = onRemoteUpdate;
        _onBranchListUpdate = onBranchListUpdate;
    },

    /**
     * Subscribe to Echo private channel for blackboard.updated events.
     */
    async startListening() {
        const uid = localStorage.getItem('currentUser');
        if (!uid) return;

        // Avoid duplicate subscriptions
        if (_echoChannel && _currentUid === uid) return;
        this.stopListening();

        _currentUid = uid;
        try {
            const echo = await getEcho();
            _echoChannel = echo.private(`App.Models.User.${uid}`)
                .listen('.blackboard.updated', (e) => this._handleRemoteEvent(e));
        } catch (err) {
            console.warn('[BBSync] Echo subscribe failed:', err);
        }
    },

    /**
     * Tear down: clear timers, unsubscribe Echo.
     */
    stopListening() {
        this.cancelPendingCommit();
        if (_echoChannel && _currentUid) {
            _echoChannel.stopListening('.blackboard.updated');
            _echoChannel = null;
        }
        _currentUid = null;
    },

    /**
     * Schedule an auto-commit after 3s debounce.
     * No-op if autoSync OFF or not logged in.
     */
    scheduleAutoCommit() {
        if (!_isAutoSyncEnabled() || !_isLoggedIn()) return;
        clearTimeout(_commitTimer);
        _commitTimer = setTimeout(() => {
            _commitTimer = null;
            _commitPromise = this._executeAutoCommit()
                .finally(() => { _commitPromise = null; });
        }, 3000);
    },

    cancelPendingCommit() {
        clearTimeout(_commitTimer);
        _commitTimer = null;
    },

    /**
     * Immediately commit if a commit is pending or in-flight.
     * Waits for any in-flight commit to complete before returning.
     */
    async flush() {
        if (_commitTimer) {
            clearTimeout(_commitTimer);
            _commitTimer = null;
            _commitPromise = this._executeAutoCommit()
                .finally(() => { _commitPromise = null; });
        }
        if (_commitPromise) {
            await _commitPromise;
        }
    },

    /**
     * Recovery: flush pending + checkout current branch (for tab-switch / online recovery).
     * Uses 'remote' owner so checkout fetches fresh data from server.
     */
    async recover() {
        if (!_isAutoSyncEnabled() || !_isLoggedIn()) return;
        await this.flush();

        const state = _getState?.();
        if (!state) return;

        try {
            await BBVCS.checkout(state, state.branchId, 'remote');
            _onRemoteUpdate?.();
        } catch (err) {
            console.warn('[BBSync] Recovery checkout failed:', err);
        }
    },

    // --- Internal ---

    async _executeAutoCommit() {
        if (_isCommitting) return;
        if (!_isLoggedIn() || !_isAutoSyncEnabled()) return;

        const state = _getState?.();
        const text = _getTextareaValue?.();
        if (!state) return;

        // Don't commit in virtual state with no text
        if (state.isVirtual && (!text || !text.trim())) return;

        _isCommitting = true;
        try {
            // Save current textarea content first
            await BBVCS.save(state, text);

            await BBVCS.commit(
                { branchId: state.branchId, branch: state.branch },
                this.deviceId
            );
        } catch (err) {
            // Silent fail for auto-sync — don't spam user with errors
            console.warn('[BBSync] Auto-commit failed:', err.message);
        } finally {
            _isCommitting = false;
        }

        // Handle deferred remote checkout (remote event arrived while editing/committing)
        if (_pendingRemoteCheckout) {
            _pendingRemoteCheckout = false;
            const st = _getState?.();
            if (st) {
                try {
                    await BBVCS.checkout(st, st.branchId, 'remote');
                    _onRemoteUpdate?.();
                    BBMessage.info(t('blackboard.autoSyncReceived'));
                } catch (err) {
                    console.warn('[BBSync] Deferred remote checkout failed:', err);
                }
            }
        }
    },

    _handleRemoteEvent(e) {
        const { branch_id, device_id } = e;

        // Self-echo filter
        if (device_id === this.deviceId) return;

        if (!_isAutoSyncEnabled()) return;

        const state = _getState?.();
        if (!state) return;

        const incomingBranchId = parseInt(branch_id) || branch_id;

        if (state.branchId === incomingBranchId) {
            // [Race-condition guard]: If user has pending or in-progress edits,
            // defer the checkout until after auto-commit completes.
            // Without this, checkout would wipe IndexedDB before the commit fires,
            // causing the user to lose whatever they typed.
            if (_commitTimer || _isCommitting) {
                _pendingRemoteCheckout = true;
                return;
            }

            // No pending edits — safe to checkout immediately
            BBVCS.checkout(state, state.branchId, 'remote').then(() => {
                _onRemoteUpdate?.();
                BBMessage.info(t('blackboard.autoSyncReceived'));
            }).catch(err => {
                console.warn('[BBSync] Remote checkout failed:', err);
            });
        } else {
            // Different branch — just refresh the branch list
            _onBranchListUpdate?.();
        }
    }
};
