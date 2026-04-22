/**
 * Walkie-Typie List - Connection List Controller
 * =================================================================
 * Responsibilities:
 * 1. Render connection list (ordered by last_signal DESC).
 * 2. InfiniteList cursor picker (identical mechanics to branch list).
 * 3. ADD button: create new connection by UID.
 * 4. CUT button: delete selected connection + wipe all data.
 * 5. 500ms debounce on cursor change before dispatching selection.
 * 6. Tag renaming (nickname).
 * 7. Initial cursor at top.
 * =================================================================
 * Dependencies: WalkieTypieService, WTDb, InfiniteList, MultiStepButton, BBMessage
 * =================================================================
 */

import { WalkieTypieService } from "./services/walkie-typie-service.js";
import { WTDb, getHKTTimestamp } from "./walkie-typie-db.js";
import { InfiniteList } from "./blackboard-ui-list.js";
import { MultiStepButton } from "./multiStepButton.js";
import { BBMessage } from "./blackboard-msg.js";
import { t } from './i18n.js';
import { T } from './timing.js';
import { makeStatusLegend } from './list-status.js';

// Per-partner "has new signal" flags, in-memory only. Reload clears
// all marks — simple by design (no localStorage round-trip).
const _newMessagePartners = new Set();

// Surgical DOM patch for a single row — avoids WTList.render() which
// wipes innerHTML and makes InfiniteList lose its active cursor, which
// cascades to a fresh loadConnection() (SFX + full board reload).
function _applyNewTagToRow(partnerUid) {
    const container = WTList.elements?.container;
    if (!container) return;
    const item = container.querySelector(
        `.walkie-typie-list-list-item[data-partner-uid="${CSS.escape(partnerUid)}"]`
    );
    if (!item) return;
    const uidEl = item.querySelector('.walkie-typie-list-uid');
    if (!uidEl) return;
    uidEl.textContent = _newMessagePartners.has(partnerUid)
        ? `${partnerUid} ${t('walkieTypie.statusNew')}`
        : partnerUid;
}

// Mark: server signal arrived for this partner. walkie-typie-core.js
// dispatches this event with `detail = content_data` (unwrapped), so
// sender_uid lives at e.detail.sender_uid — not under .content_data.
window.addEventListener('walkie-typie:content-update', (e) => {
    const uid = e.detail?.sender_uid;
    if (!uid) return;
    if (_newMessagePartners.has(uid)) return;  // already marked, skip DOM touch
    _newMessagePartners.add(uid);
    _applyNewTagToRow(uid);
});

// Clear: user navigates into WT > Text with a partner selected.
// Covers the flow "list item active → go to text sub-navi → [NEW] off".
window.addEventListener('navi:pageChanged', (e) => {
    if (e.detail?.page !== 'walkie-typie-text') return;
    const sel = WTList.selectedConnection;
    if (!sel) return;
    if (_newMessagePartners.delete(sel.partner_uid)) {
        _applyNewTagToRow(sel.partner_uid);
    }
});

export const WTList = {
    elements: {
        container: document.querySelector(".walkie-typie-list-list-container"),
        uidInput: document.getElementById("walkie-typie-add-uid"),
        addBtn: document.getElementById("walkie-typie-add-btn"),
        cutBtn: document.getElementById("walkie-typie-cut-btn"),
    },

    connections: [],
    infiniteList: null,
    selectionTimer: null,
    selectedConnection: null,

    init() {
        this.bindEvents();
        // [Optimization]: 移除立即請求，改由 AuthManager 初始化完畢後觸發 "auth:updated" 時執行
        // 這能確保 Session Cookie 已準備就緒，避免 401 Unauthorized 錯誤
    },

    bindEvents() {
        // [Auth Event]: Re-fetch when auth state changes (Login/Logout)
        window.addEventListener("auth:updated", () => {
            if (localStorage.getItem("currentUser")) {
                this.fetchConnections();
            } else {
                // Full cleanup on logout
                this.connections = [];
                this.selectedConnection = null;
                clearTimeout(this.selectionTimer);
                this.infiniteList = null;
                this.render();
                // Wipe partner data from IndexedDB (privacy: THEY records should not persist)
                WTDb.wipeTheyRecords();
            }
        });

        // ADD Button
        if (this.elements.addBtn) {
            new MultiStepButton(this.elements.addBtn, {
                sound: "UIGeneralOK.mp3",
                steps: 3,
                action: async () => {
                    const uid = this.elements.uidInput?.value?.trim();
                    if (!uid) {
                        BBMessage.error(t('walkieTypie.uidRequired'));
                        return;
                    }

                    const msg = BBMessage.loading(t('walkieTypie.connecting'));
                    try {
                        const result = await WalkieTypieService.createConnection({ uid });
                        if (result.connection) {
                            this.handleUpdate(result.connection);
                            this.elements.uidInput.value = "";
                            msg.update(t('walkieTypie.connected'));
                        }
                    } catch (e) {
                        console.error("CONNECT ERROR:", e);
                        msg.close();
                        const isUserError = e.status >= 400 && e.status < 500;
                        BBMessage.error(isUserError ? (e.message || t('walkieTypie.connectFailed')) : t('walkieTypie.connectFailed'));
                    }
                }
            });
        }

        // CUT Button — delete selected connection
        if (this.elements.cutBtn) {
            new MultiStepButton(this.elements.cutBtn, {
                sound: "UIGeneralCancel.mp3",
                steps: 3,
                action: async () => {
                    if (!this.selectedConnection) {
                        BBMessage.error(t('walkieTypie.noTarget'));
                        return;
                    }

                    const partnerUid = this.selectedConnection.partner_uid;
                    const myBranchId = this.selectedConnection.my_branch_id;
                    const partnerBranchId = this.selectedConnection.partner_branch_id;

                    const msg = BBMessage.loading(t('walkieTypie.cutting'));
                    try {
                        await WalkieTypieService.deleteConnection(partnerUid);

                        // Wipe local IndexedDB
                        await WTDb.deleteBranchRecords(myBranchId);
                        await WTDb.deleteBranchRecords(partnerBranchId);

                        // Remove from array
                        const index = this.connections.findIndex(c => c.partner_uid === partnerUid);
                        if (index !== -1) this.connections.splice(index, 1);

                        // Dispatch disconnection event
                        window.dispatchEvent(new CustomEvent("walkie-typie:disconnected", {
                            detail: { partnerUid }
                        }));

                        this.selectedConnection = null;
                        this.render();
                        msg.update(t('walkieTypie.cutComplete'));
                    } catch (e) {
                        console.error("CUT ERROR:", e);
                        msg.close();
                        const isUserError = e.status >= 400 && e.status < 500;
                        BBMessage.error(isUserError ? (e.message || t('walkieTypie.cutFailed')) : t('walkieTypie.cutFailed'));
                    }
                }
            });
        }

        // Listen for real-time connection updates (from WebSocket)
        window.addEventListener("walkie-typie:connection-update", (e) => {
            const newConn = e.detail;
            if (newConn.deleted) {
                this.handleDelete(newConn.partner_uid);
            } else {
                this.handleUpdate(newConn);
            }
        });

        // Listen for InfiniteList cursor changes → 500ms debounce
        // Filter: ONLY process events from WT list container
        window.addEventListener("list:selectionChanged", (e) => {
            const { item } = e.detail;
            if (!item || !this.elements.container || !this.elements.container.contains(item)) return;

            const partnerUid = item.dataset.partnerUid;
            const conn = this.connections.find(c => c.partner_uid === partnerUid);

            if (conn) {
                this.selectedConnection = conn;

                // debounce before dispatching to text page
                clearTimeout(this.selectionTimer);
                this.selectionTimer = setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("walkie-typie:selected", {
                        detail: conn
                    }));
                }, T('frontend.ui.listSelectionDebounce'));
            }
        });

        // Tier 18: loopList setting removed — InfiniteList.loop always false.

        // Window Focus → re-fetch connections (partner may have added us)
        window.addEventListener("focus", () => {
            const activePage = document.querySelector('.page.active');
            const isWTActive = activePage && activePage.dataset.page && activePage.dataset.page.startsWith('walkie-typie-');
            if (isWTActive) {
                this.fetchConnections();
            }
        });

        // Connection search — matches the row's full visible content
        // (tag input, partner uid, last signal timestamp) + any input's
        // current value, so e.g. filtering by a partner's uid works
        // even if the user hasn't set a friendly tag for them.
        const $wtSearch = document.getElementById('walkie-typie-search');
        const $wtListContainerEl = document.querySelector('.walkie-typie-list-list-container');

        const applyWtSearch = () => {
            if (!$wtListContainerEl) return;
            const query = ($wtSearch?.value || '').toLowerCase().trim();
            $wtListContainerEl.querySelectorAll('.walkie-typie-list-list-item').forEach(item => {
                if (!query) { item.style.display = ''; return; }
                let text = item.innerText.toLowerCase();
                item.querySelectorAll('input, textarea').forEach(el => {
                    if (el.value) text += ' ' + el.value.toLowerCase();
                });
                item.style.display = text.includes(query) ? '' : 'none';
            });
            this.infiniteList?.refresh();
        };

        $wtSearch?.addEventListener('input', applyWtSearch);

        // Re-apply after any list re-render (fetchConnections / WS event /
        // auth change). Rebuilt rows default to display:'' — without this
        // the filter silently drops whenever the poll ticks.
        if ($wtListContainerEl) {
            new MutationObserver(() => applyWtSearch())
                .observe($wtListContainerEl, { childList: true });
        }
    },

    async fetchConnections() {
        if (!localStorage.getItem("currentUser")) return;

        // [Focus Protection]: Skip update if user is currently renaming a tag
        const isTyping = document.activeElement && document.activeElement.classList.contains('walkie-typie-list-tag');
        if (isTyping) return;

        try {
            const data = await WalkieTypieService.getConnections();
            if (data?.connections) {
                this.connections = data.connections;
                this.connections.sort((a, b) => b.last_signal - a.last_signal);
                this.render();
            }
        } catch (e) {
            // Silent on 401 — user might not be logged in
            if (e.status && e.status !== 401) {
                BBMessage.error(t('walkieTypie.fetchFailed'));
            }
            console.warn("WTList: Fetch Failed", e);
        }
    },

    handleUpdate(newConn) {
        const index = this.connections.findIndex(c => c.partner_uid === newConn.partner_uid);
        if (index !== -1) {
            this.connections[index] = { ...this.connections[index], ...newConn };
        } else {
            this.connections.push(newConn);
        }

        this.connections.sort((a, b) => b.last_signal - a.last_signal);
        this.render();
    },

    handleDelete(partnerUid) {
        const index = this.connections.findIndex(c => c.partner_uid === partnerUid);
        if (index !== -1) {
            const conn = this.connections[index];
            this.connections.splice(index, 1);

            WTDb.deleteBranchRecords(conn.my_branch_id);
            WTDb.deleteBranchRecords(conn.partner_branch_id);

            window.dispatchEvent(new CustomEvent("walkie-typie:disconnected", {
                detail: { partnerUid }
            }));

            this.selectedConnection = null;
            this.render();
        }
    },

    render() {
        if (!this.elements.container) return;

        // Preserve selection across the wipe so InfiniteList.refresh()
        // finds .active in the DOM and does NOT fall through to
        // setCursor(0, true), which dispatches list:selectionChanged
        // → walkie-typie:selected → loadConnection (SFX + double board
        // re-sync). Matches the BB/BC render pattern.
        const activeUid = this.selectedConnection?.partner_uid ?? null;

        this.elements.container.innerHTML = "";

        this.connections.forEach(conn => {
            const item = document.createElement("div");
            item.classList.add("walkie-typie-list-list-item");
            if (activeUid && conn.partner_uid === activeUid) {
                item.classList.add("active");
            }
            item.dataset.partnerUid = conn.partner_uid;

            // Tag input (nickname)
            const tagInput = document.createElement("input");
            tagInput.type = "text";
            tagInput.classList.add("walkie-typie-list-tag");
            tagInput.placeholder = t('walkieTypie.tagPlaceholder');
            tagInput.name = "walkie-typie-list-tag";
            tagInput.value = conn.partner_tag || "";

            tagInput.addEventListener("change", async (e) => {
                const newTag = e.target.value.trim();
                try {
                    await WalkieTypieService.updateConnectionTag(conn.partner_uid, { tag: newTag });
                    conn.partner_tag = newTag;
                } catch (err) {
                    console.error("TAG UPDATE ERROR:", err);
                    BBMessage.error(t('walkieTypie.tagUpdateFailed'));
                }
            });

            // Prevent InfiniteList from capturing input events
            tagInput.addEventListener("click", (e) => e.stopPropagation());
            tagInput.addEventListener("keydown", (e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
                e.stopPropagation();
            });

            // Last Signal
            const lastSignal = document.createElement("div");
            lastSignal.classList.add("walkie-typie-list-last-signal");
            lastSignal.textContent = conn.last_signal ? getHKTTimestamp(conn.last_signal) : t('common.head');

            // UID — appended with "[NEW]" when this partner has fired
            // a content-update since the last time we opened their chat.
            const uid = document.createElement("div");
            uid.classList.add("walkie-typie-list-uid");
            uid.textContent = _newMessagePartners.has(conn.partner_uid)
                ? `${conn.partner_uid} ${t('walkieTypie.statusNew')}`
                : conn.partner_uid;

            // Tier 22.6: WT does NOT have per-connection sync tags in its
            // data model (P2P live, no commit-status per connection), so
            // it only fires the icons that map to real WT state:
            //   HEAD  → this connection is currently open in WT-TEXT
            //   LOCAL → conversation exists (my_branch_id or partner_branch_id)
            // `synced / asynced` are deliberately skipped. Earlier versions
            // forced `online ↦ synced` and `[NEW] ↦ asynced`; those were
            // invented mappings that conflated unrelated concepts.
            const isHead = !!activeUid && conn.partner_uid === activeUid;
            const hasLocal = !!(conn.my_branch_id || conn.partner_branch_id);
            const iconsWrap = makeStatusLegend({
                head:  isHead,
                local: hasLocal,
            });

            item.appendChild(tagInput);
            item.appendChild(lastSignal);
            item.appendChild(uid);
            item.appendChild(iconsWrap);
            this.elements.container.appendChild(item);
        });

        // Initialize / Refresh InfiniteList — cursor at top (index 0).
        // Tier 18: no loop (scroll stops at top/bottom).
        if (this.infiniteList) {
            this.infiniteList.refresh();
        } else if (this.connections.length > 0) {
            this.infiniteList = new InfiniteList(
                this.elements.container,
                ".walkie-typie-list-list-item"
            );
        }
    }
};

// Init
WTList.init();
