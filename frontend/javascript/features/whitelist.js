/**
 * Feature: Whitelist — owner-side "Apply Preset" UI for both
 * Broadcast channels and Inboxes.
 *
 * Presets themselves (T2 whitelists) and distribution grants (T1
 * whitelist_distributions) are admin-managed via artisan commands.
 * This shelf ONLY surfaces the subset the current user is cleared
 * to apply, lets them pick one to attach to the active target, or
 * detach to revert to public.
 *
 * Visibility is page-scoped:
 *   - broadcast-channel  → owner of the active channel
 *                          (BCChannel.isOwnerMode + serverChannelId set)
 *   - inbox-thread       → owner of the active inbox
 *                          (IXThread.inbox.owner_uid === currentUid)
 *
 * Whitelist semantics flip per-target — same preset means
 * different things depending on which subsystem applied it:
 *   BC: members can READ the channel
 *   IX: members can SUBMIT to the inbox
 * The shelf intentionally does NOT explain this — the preset's
 * own name should communicate the audience scope.
 */

import { BCChannel } from '../broadcast-channel.js';
import { IXThread } from '../inbox-thread.js';
import { BroadcastWhitelistService } from '../services/broadcast-whitelist-service.js';
import { InboxService } from '../services/inbox-service.js';
import { BBMessage } from '../blackboard-msg.js';
import { t } from '../i18n.js';

const ICON_URL = '/images/whitelist.svg';

let _shelfRoot = null;
let _presets = [];

// Per-preset member cache. Members are sensitive — fetched lazily
// the first time the user expands a row, then cached for the
// session. Cleared on shelf re-open via refresh().
const _membersCache = new Map();
const _expanded = new Map();

/**
 * Identify which subsystem the active page belongs to. Returns
 * a small descriptor object so the rest of the file can stay
 * page-agnostic. Returns null when no active inbox / channel.
 */
function currentScope() {
    const activePage = document.querySelector('.page.active')?.dataset?.page;

    if (activePage === 'broadcast-channel') {
        const ch = BCChannel?.currentChannel;
        if (!ch?.serverChannelId || !BCChannel?.isOwnerMode) return null;
        return {
            kind: 'bc',
            id: ch.serverChannelId,
            currentWhitelistId: ch.whitelistId ?? null,
            apply: (whitelistId) => BroadcastWhitelistService.apply(ch.serverChannelId, whitelistId),
            onAfterApply: (whitelistId) => {
                ch.whitelistId = whitelistId ?? null;
                window.dispatchEvent(new CustomEvent('broadcast:localBootstrapped'));
            },
            errNotCast: t('whitelist.notCast'),
        };
    }

    if (activePage === 'inbox-thread') {
        const ix = IXThread?.inbox;
        const me = localStorage.getItem('currentUser');
        if (!ix || !me || ix.owner_uid !== me) return null;
        return {
            kind: 'ix',
            id: ix.id,
            currentWhitelistId: ix.whitelist_id ?? null,
            apply: (whitelistId) => InboxService.applyWhitelist(ix.id, whitelistId),
            onAfterApply: (whitelistId) => {
                ix.whitelist_id = whitelistId ?? null;
                // Inbox list re-fetches on selection refresh — fire the
                // same signal it listens to for live row updates.
                window.dispatchEvent(new CustomEvent('inbox:signalUpdated', {
                    detail: { inboxId: ix.id, lastSignal: ix.last_signal },
                }));
            },
            errNotCast: t('whitelist.notCast'),
        };
    }

    return null;
}

function render() {
    if (!_shelfRoot) return;
    _shelfRoot.innerHTML = '';

    const scope = currentScope();
    const currentId = scope?.currentWhitelistId ?? null;

    const panel = document.createElement('div');
    panel.className = 'feature-panel';
    panel.dataset.feature = 'whitelist';
    _shelfRoot.appendChild(panel);

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'whitelist-shelf-header';
    const headerIcon = document.createElement('span');
    headerIcon.className = 'whitelist-shelf-header-icon';
    const headerTitle = document.createElement('span');
    headerTitle.className = 'whitelist-shelf-header-title';
    headerTitle.textContent = t('whitelist.shelfTitle');
    header.appendChild(headerIcon);
    header.appendChild(headerTitle);
    panel.appendChild(header);

    const current = _presets.find(p => p.id === currentId) || null;

    // ── Current state card (PUBLIC vs PRIVATE) ──
    const stateCard = document.createElement('div');
    stateCard.className = 'whitelist-shelf-state ' + (current ? 'is-private' : 'is-public');

    const stateBadge = document.createElement('div');
    stateBadge.className = 'whitelist-shelf-state-badge';
    stateBadge.textContent = current ? t('whitelist.privateLabel') : t('whitelist.publicLabel');
    stateCard.appendChild(stateBadge);

    const stateBody = document.createElement('div');
    stateBody.className = 'whitelist-shelf-state-body';
    if (current) {
        const codeLine = document.createElement('div');
        codeLine.className = 'whitelist-shelf-state-code';
        codeLine.textContent = current.code;
        const nameLine = document.createElement('div');
        nameLine.className = 'whitelist-shelf-state-name';
        nameLine.textContent = current.name;
        const countLine = document.createElement('div');
        countLine.className = 'whitelist-shelf-state-count';
        countLine.textContent = t('whitelist.memberCount', { count: current.member_count });
        stateBody.appendChild(codeLine);
        stateBody.appendChild(nameLine);
        stateBody.appendChild(countLine);
    } else {
        const desc = document.createElement('div');
        desc.className = 'whitelist-shelf-state-desc';
        desc.textContent = t('whitelist.publicDesc');
        stateBody.appendChild(desc);
    }
    stateCard.appendChild(stateBody);

    if (current) {
        const detach = document.createElement('button');
        detach.type = 'button';
        detach.className = 'whitelist-shelf-detach';
        detach.textContent = t('whitelist.detachBtn');
        detach.addEventListener('click', () => apply(null));
        stateCard.appendChild(detach);
    }

    panel.appendChild(stateCard);

    // ── Available presets section ──
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'whitelist-shelf-section-title';
    sectionTitle.textContent = t('whitelist.availableSection');
    panel.appendChild(sectionTitle);

    const list = document.createElement('div');
    list.className = 'whitelist-shelf-list';

    if (_presets.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'whitelist-shelf-empty';
        empty.textContent = t('whitelist.empty');
        list.appendChild(empty);
    } else {
        for (const p of _presets) {
            const row = document.createElement('div');
            row.className = 'whitelist-shelf-row';
            const isActive = p.id === currentId;
            if (isActive) row.classList.add('is-active');

            if (isActive) {
                const badge = document.createElement('div');
                badge.className = 'whitelist-shelf-active-badge';
                badge.textContent = t('whitelist.appliedBadge');
                row.appendChild(badge);
            } else {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'whitelist-shelf-apply';
                btn.textContent = t('whitelist.applyBtn');
                btn.addEventListener('click', () => apply(p.id));
                row.appendChild(btn);
            }

            const meta = document.createElement('div');
            meta.className = 'whitelist-shelf-meta';
            const codeEl = document.createElement('div');
            codeEl.className = 'whitelist-shelf-code';
            codeEl.textContent = p.code;
            const nameEl = document.createElement('div');
            nameEl.className = 'whitelist-shelf-name';
            nameEl.textContent = p.name;
            meta.appendChild(codeEl);
            meta.appendChild(nameEl);
            if (p.description) {
                const desc = document.createElement('div');
                desc.className = 'whitelist-shelf-desc';
                desc.textContent = p.description;
                meta.appendChild(desc);
            }

            const footer = document.createElement('div');
            footer.className = 'whitelist-shelf-meta-footer';
            const count = document.createElement('div');
            count.className = 'whitelist-shelf-count';
            count.textContent = t('whitelist.memberCount', { count: p.member_count });
            footer.appendChild(count);

            const isExpanded = !!_expanded.get(p.id);
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'whitelist-shelf-view-btn' + (isExpanded ? ' is-open' : '');
            toggle.textContent = isExpanded ? t('whitelist.hideMembers') : t('whitelist.viewMembers');
            toggle.addEventListener('click', () => toggleMembers(p.id));
            footer.appendChild(toggle);
            meta.appendChild(footer);

            if (isExpanded) {
                const membersBlock = document.createElement('div');
                membersBlock.className = 'whitelist-shelf-members';
                const cached = _membersCache.get(p.id);
                if (!cached || cached.state === 'loading') {
                    membersBlock.classList.add('is-loading');
                    membersBlock.textContent = t('whitelist.loadingMembers');
                } else if (cached.state === 'error') {
                    membersBlock.classList.add('is-error');
                    membersBlock.textContent = cached.error || t('whitelist.errFetchMembers');
                } else if (cached.state === 'loaded') {
                    if ((cached.members || []).length === 0) {
                        membersBlock.classList.add('is-empty');
                        membersBlock.textContent = t('whitelist.membersEmpty');
                    } else {
                        for (const uid of cached.members) {
                            const item = document.createElement('div');
                            item.className = 'whitelist-shelf-member';
                            item.textContent = uid;
                            membersBlock.appendChild(item);
                        }
                    }
                }
                meta.appendChild(membersBlock);
            }

            row.appendChild(meta);

            list.appendChild(row);
        }
    }
    panel.appendChild(list);
}

async function apply(whitelistId) {
    const scope = currentScope();
    if (!scope) {
        BBMessage.error(t('whitelist.notCast'));
        return;
    }
    const msg = BBMessage.loading(whitelistId ? t('whitelist.applying') : t('whitelist.detaching'));
    try {
        await scope.apply(whitelistId);
        scope.onAfterApply?.(whitelistId);
        msg.update(whitelistId ? t('whitelist.applied') : t('whitelist.detached'), 2000);
        render();
    } catch (e) {
        msg.close();
        const status = e?.status || e?.response?.status;
        if (status === 403) BBMessage.error(t('whitelist.errNotAuthorised'));
        else if (status === 404) BBMessage.error(t('whitelist.errNotFound'));
        else BBMessage.error(t('whitelist.errApplyFailed'));
        console.error('[Whitelist] apply failed', e);
    }
}

async function refresh() {
    _membersCache.clear();
    _expanded.clear();
    try {
        const data = await BroadcastWhitelistService.listApplicable();
        _presets = data?.whitelists ?? [];
    } catch (e) {
        console.error('[Whitelist] fetch failed', e);
        _presets = [];
    }
    render();
}

async function toggleMembers(whitelistId) {
    const wasExpanded = !!_expanded.get(whitelistId);
    if (wasExpanded) {
        _expanded.set(whitelistId, false);
        render();
        return;
    }

    _expanded.set(whitelistId, true);
    if (!_membersCache.has(whitelistId)) {
        _membersCache.set(whitelistId, { state: 'loading' });
        render();
        try {
            const data = await BroadcastWhitelistService.fetchMembers(whitelistId);
            _membersCache.set(whitelistId, {
                state: 'loaded',
                members: data?.members ?? [],
            });
        } catch (e) {
            console.error('[Whitelist] members fetch failed', e);
            const status = e?.status || e?.response?.status;
            const error = status === 403
                ? t('whitelist.errMembersForbidden')
                : t('whitelist.errFetchMembers');
            _membersCache.set(whitelistId, { state: 'error', error });
        }
    }
    render();
}

export const feature = {
    id: 'whitelist',
    iconUrl: ICON_URL,
    pages: ['broadcast-channel', 'inbox-thread'],
    hasShelf: true,
    shouldShow(page) {
        if (page === 'broadcast-channel') {
            if (!BCChannel?.isOwnerMode) return false;
            return !!BCChannel?.currentChannel?.serverChannelId;
        }
        if (page === 'inbox-thread') {
            const ix = IXThread?.inbox;
            const me = localStorage.getItem('currentUser');
            return !!(ix && me && ix.owner_uid === me);
        }
        return false;
    },
    initShelf($shelf) {
        $shelf.classList.add('whitelist-shelf');
        _shelfRoot = $shelf;
    },
    onOpen() {
        refresh();
    },
};
