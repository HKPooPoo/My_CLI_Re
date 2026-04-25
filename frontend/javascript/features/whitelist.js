/**
 * Feature: Whitelist — owner-side "Apply Preset" UI for BC channels.
 *
 * Presets themselves (T2 whitelists) and distribution grants (T1
 * whitelist_distributions) are admin-managed via artisan commands.
 * This shelf ONLY surfaces the subset the current user is cleared
 * to apply (server filters via WhitelistService::listForApplicant),
 * lets them pick one to attach to the active channel, or detach to
 * revert to public.
 *
 * Visibility: broadcast-channel page only; owner mode; channel
 * must be cast (serverChannelId present — you can't apply a
 * whitelist to a draft that has no server row yet).
 */

import { BCChannel } from '../broadcast-channel.js';
import { BroadcastWhitelistService } from '../services/broadcast-whitelist-service.js';
import { BBMessage } from '../blackboard-msg.js';
import { t } from '../i18n.js';

const ICON_URL = '/images/whitelist.svg';

// Module-level cache of the last rendered shelf root so the apply
// handler can re-render after a successful PUT without a bespoke
// re-entry. Single-shelf so a bare reference is fine.
let _shelfRoot = null;
let _presets = [];

// Per-preset member cache. Members are sensitive — fetched lazily
// the first time the user expands a row, then cached for the
// session. Cleared on shelf re-open via refresh().
//   Map<whitelistId, { state: 'loading'|'loaded'|'error', members?, error? }>
const _membersCache = new Map();
// Per-preset expand state.  Map<whitelistId, boolean>
const _expanded = new Map();

function currentChannelWhitelistId() {
    return BCChannel?.currentChannel?.whitelistId ?? null;
}

function render() {
    if (!_shelfRoot) return;
    _shelfRoot.innerHTML = '';

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

    const currentId = currentChannelWhitelistId();
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

            // APPLY first so it docks left, mirrors LLM SEND.
            // Active row replaces APPLY with an "ACTIVE" badge.
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

            // Footer row inside meta: count + view/hide toggle
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

            // Member list block — only present when expanded
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
    const ch = BCChannel?.currentChannel;
    if (!ch?.serverChannelId) {
        BBMessage.error(t('whitelist.notCast'));
        return;
    }
    const msg = BBMessage.loading(whitelistId ? t('whitelist.applying') : t('whitelist.detaching'));
    try {
        await BroadcastWhitelistService.apply(ch.serverChannelId, whitelistId);
        ch.whitelistId = whitelistId ?? null;
        // Let the list re-render its lock icon via the existing
        // localBootstrapped path which refetches the channel list.
        window.dispatchEvent(new CustomEvent('broadcast:localBootstrapped'));
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
    // New shelf-open session — drop any stale member caches so the
    // user sees fresh data if a preset's roster changed.
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
    pages: ['broadcast-channel'],
    hasShelf: true,
    shouldShow(page) {
        if (page !== 'broadcast-channel') return false;
        if (!BCChannel?.isOwnerMode) return false;
        return !!BCChannel?.currentChannel?.serverChannelId;
    },
    initShelf($shelf) {
        $shelf.classList.add('whitelist-shelf');
        _shelfRoot = $shelf;
    },
    onOpen() {
        refresh();
    },
};
