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

    const title = document.createElement('div');
    title.className = 'whitelist-shelf-title';
    title.textContent = t('whitelist.shelfTitle');
    panel.appendChild(title);

    const currentId = currentChannelWhitelistId();
    const current = _presets.find(p => p.id === currentId) || null;

    const state = document.createElement('div');
    state.className = 'whitelist-shelf-current';
    state.textContent = current
        ? t('whitelist.currentApplied', { code: current.code, name: current.name })
        : t('whitelist.currentPublic');
    panel.appendChild(state);

    if (current) {
        const detach = document.createElement('button');
        detach.type = 'button';
        detach.className = 'whitelist-shelf-detach';
        detach.textContent = t('whitelist.detachBtn');
        detach.addEventListener('click', () => apply(null));
        panel.appendChild(detach);
    }

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
            if (p.id === currentId) row.classList.add('is-active');

            // APPLY first so it docks left — same row layout as the
            // LLM shelf's SEND button (primary action on the drag-
            // away side, drops the row's eye to the trigger first).
            if (p.id !== currentId) {
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
            const count = document.createElement('div');
            count.className = 'whitelist-shelf-count';
            count.textContent = t('whitelist.memberCount', { count: p.member_count });
            meta.appendChild(count);
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
    try {
        const data = await BroadcastWhitelistService.listApplicable();
        _presets = data?.whitelists ?? [];
    } catch (e) {
        console.error('[Whitelist] fetch failed', e);
        _presets = [];
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
