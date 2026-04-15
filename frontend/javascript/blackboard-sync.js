/**
 * Blackboard Auto-Sync (Multi-Device)
 * =================================================================
 * WhatsApp-style auto-sync: edits auto-commit after 3s debounce,
 * other devices receive WebSocket notification and auto-checkout.
 * Self-echo filtered via per-tab deviceId (sessionStorage).
 * =================================================================
 */

import { BBVCS } from './blackboard-vcs.js';
import { BBCore } from './blackboard-core.js';
import { BlackboardService } from './services/blackboard-service.js';
import { BBMessage } from './blackboard-msg.js';
import { getEcho } from './echo-service.js';
import { t } from './i18n.js';
import { T } from './timing.js';
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
let _pendingRemoteCheckout = null; // P6: null | { branchId } (scoped, not boolean)
let _checkoutChain = Promise.resolve(); // P5: serializes overlapping remote checkouts
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
     * Schedule an auto-commit after the configured idle delay.
     * No-op if autoSync OFF or not logged in.
     */
    scheduleAutoCommit() {
        if (!_isAutoSyncEnabled() || !_isLoggedIn()) return;
        clearTimeout(_commitTimer);
        _commitTimer = setTimeout(() => {
            _commitTimer = null;
            _commitPromise = this._executeAutoCommit()
                .finally(() => { _commitPromise = null; });
        }, T('frontend.background.bbAutoCommitDelay'));
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
    /**
     * True if user has unsaved edits (pending debounce or in-flight commit).
     * Used by poll fallback to avoid overwriting active editing.
     */
    get hasPendingEdits() {
        return !!_commitTimer || _isCommitting;
    },

    async recover() {
        if (!_isAutoSyncEnabled() || !_isLoggedIn()) return;

        const state = _getState?.();
        if (!state?.branchId) return;

        try {
            // Compare local vs server timestamps to decide sync direction.
            // Without this, flush() blindly commits local data and overwrites
            // newer server content from another device.
            const localBranches = await BBCore.getAllBranches('local');
            const localBranch = localBranches.find(b => b.id === state.branchId);
            const localLastUpdate = localBranch?.lastUpdate ?? 0;

            const serverData = await BlackboardService.fetchBranches();
            const serverBranch = serverData?.branches?.find(
                b => parseInt(b.branch_id) === state.branchId
            );
            const serverLastUpdate = serverBranch ? Number(serverBranch.last_update) : 0;

            if (serverLastUpdate > localLastUpdate) {
                // Server is newer → download only, don't overwrite with stale local data
                const fetched = await BBVCS.checkout(state, state.branchId, 'remote');
                if (fetched) {
                    _onRemoteUpdate?.();
                    _onBranchListUpdate?.();
                }
            } else if (localLastUpdate > serverLastUpdate) {
                // Local is newer → upload
                await this.flush();
                _onBranchListUpdate?.();
            }
            // Equal → already in sync, do nothing
        } catch (err) {
            console.warn('[BBSync] Recovery failed:', err);
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
        let commitOk = false;
        try {
            // Save current textarea content first
            await BBVCS.save(state, text);

            await BBVCS.commit(
                { branchId: state.branchId, branch: state.branch },
                this.deviceId
            );
            commitOk = true;

            // P1: Refresh branch list + chips so status shows "synced" immediately
            _onRemoteUpdate?.();
            _onBranchListUpdate?.();
        } catch (err) {
            // P3: Show toast so user knows auto-commit failed (instead of silent swallow)
            console.warn('[BBSync] Auto-commit failed:', err.message);
            BBMessage.info(t('blackboard.autoSyncFailed'));
        } finally {
            _isCommitting = false;
        }

        // P6: Handle deferred remote checkout — scoped by branch ID
        if (_pendingRemoteCheckout) {
            const target = _pendingRemoteCheckout;
            _pendingRemoteCheckout = null;
            const st = _getState?.();
            // Only execute if user is still on the same branch that triggered the deferral
            if (st && st.branchId === target.branchId) {
                _checkoutChain = _checkoutChain.then(async () => {
                    try {
                        const fetched = await BBVCS.checkout(st, target.branchId, 'remote');
                        if (fetched) {
                            _onRemoteUpdate?.();
                            BBMessage.info(t('blackboard.autoSyncReceived'));
                        }
                    } catch (err) {
                        console.warn('[BBSync] Deferred remote checkout failed:', err);
                    }
                });
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
            if (_commitTimer || _isCommitting) {
                // P6: Store target branch ID so deferred checkout validates scope
                _pendingRemoteCheckout = { branchId: incomingBranchId };
                return;
            }

            // P5: Serialize overlapping checkouts via promise chain
            _checkoutChain = _checkoutChain.then(async () => {
                try {
                    const fetched = await BBVCS.checkout(state, state.branchId, 'remote');
                    if (fetched) {
                        _onRemoteUpdate?.();
                        BBMessage.info(t('blackboard.autoSyncReceived'));
                    }
                } catch (err) {
                    console.warn('[BBSync] Remote checkout failed:', err);
                }
            });
        } else {
            // Different branch — just refresh the branch list
            _onBranchListUpdate?.();
        }
    }
};
