/**
 * Feature: Flashcard Maker + Player (shelf-local)
 * =================================================================
 * Tier 9d-5: Player lives INSIDE the shelf panel (no overlay
 * takeover). Tier 9e extends to BC channels — owner edits locally
 * via BCMeta and ships the deck to the server bundled with the
 * next CAST; subscribers read via `BroadcastFlashcardsService`
 * (falls back to the deck already in the channel-index response
 * when present).
 *
 * Data shape (BB + BC both):
 *     {
 *         cards: [{ front, back }, ...],
 *         mode:  "sequential" | "random",
 *         playState: { currentIdx, face, randomHistory }
 *     }
 *
 * Scope branching:
 *   - BB:  users.settings.branchAssets.{branchId}.flashcard via sync-service
 *   - BC owner:  db.broadcast_channels[localId].flashcards via BCMeta
 *   - BC reader: BCChannel.currentChannel.flashcards (seeded from index
 *     response; no direct fetch needed on open)
 * =================================================================
 */

import { getSetting, setSetting } from '../sync-service.js';
import { BBState } from '../blackboard.js';
import { BBMessage } from '../blackboard-msg.js';
import { BCChannel } from '../broadcast-channel.js';
import { BCMeta } from '../broadcast-db.js';
import { BroadcastFlashcardsService } from '../services/broadcast-flashcards-service.js';
import { t } from '../i18n.js';

const ICON_URL = '/images/flashcard.svg';

// ── Data helpers ───────────────────────────────────────────────────

function defaultDeck() {
    return {
        cards: [],
        mode: 'sequential',
        playState: { currentIdx: 0, face: 'front', randomHistory: [] },
    };
}

function normaliseDeck(raw) {
    const deck = defaultDeck();
    // Laravel DB facade returns JSONB columns as strings (not
    // auto-decoded the way Eloquent `$casts = ['col' => 'array']`
    // would). The channel-index snapshot therefore hands `flashcards`
    // to us as a JSON string. Parse defensively — a bad string
    // (manual DB tinkering, truncation) falls back to an empty deck.
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); }
        catch { return deck; }
    }
    if (!raw || typeof raw !== 'object') return deck;
    if (Array.isArray(raw.cards)) {
        deck.cards = raw.cards
            .map(c => ({
                front: typeof c?.front === 'string' ? c.front.trim() : '',
                back:  typeof c?.back  === 'string' ? c.back.trim()  : '',
            }))
            .filter(c => c.front || c.back);
    }
    if (raw.mode === 'random' || raw.mode === 'sequential') deck.mode = raw.mode;
    if (raw.playState && typeof raw.playState === 'object') {
        const ps = raw.playState;
        deck.playState.currentIdx = Number.isInteger(ps.currentIdx) ? ps.currentIdx : 0;
        deck.playState.face = (ps.face === 'back') ? 'back' : 'front';
        deck.playState.randomHistory = Array.isArray(ps.randomHistory) ? ps.randomHistory.slice(-10) : [];
    }
    if (deck.cards.length === 0) deck.playState.currentIdx = 0;
    else if (deck.playState.currentIdx >= deck.cards.length) deck.playState.currentIdx = deck.cards.length - 1;
    else if (deck.playState.currentIdx < 0) deck.playState.currentIdx = 0;
    return deck;
}

// ── Context ────────────────────────────────────────────────────────

function getActivePage() {
    return document.querySelector('.page.active')?.dataset.page || null;
}

function resolveScope() {
    const page = getActivePage();
    if (page === 'blackboard-log') {
        const branchId = BBState?.branchId;
        if (!branchId) return null;
        return {
            kind: 'bb',
            branchId,
            title: (BBState?.branch || 'NOTEBOOK'),
            readOnly: false,
        };
    }
    if (page === 'broadcast-channel') {
        const ch = BCChannel?.currentChannel;
        if (!ch) return null;
        const isOwner = !!BCChannel?.isOwnerMode;
        // Reader uses the server's snapshot sitting on the channel
        // object (from the /channels index response). Owner uses the
        // local BCMeta row so in-progress edits between casts don't
        // leak to subscribers prematurely.
        return {
            kind: 'bc',
            localId: ch.localId ?? null,
            serverChannelId: ch.serverChannelId ?? null,
            channelSnapshot: ch,          // reader fallback source
            title: ch.name || 'CHANNEL',
            readOnly: !isOwner,
        };
    }
    return null;
}

async function loadDeck(scope) {
    if (!scope) return defaultDeck();
    if (scope.kind === 'bb') {
        const raw = getSetting(`branchAssets.${scope.branchId}.flashcard`, null);
        return normaliseDeck(raw);
    }
    if (scope.kind === 'bc') {
        if (!scope.readOnly && scope.localId != null) {
            // Owner path — local is the source of truth between casts.
            const raw = await BCMeta.getFlashcards(scope.localId);
            return normaliseDeck(raw);
        }
        // Reader path — trust the snapshot from the channel-index
        // response first (cheap, already loaded). No direct fetch on
        // open; stakeholder-facing subscribers can pull `latest` via
        // `BroadcastFlashcardsService.fetch()` if we later add a
        // refresh button.
        const raw = scope.channelSnapshot?.flashcards ?? null;
        return normaliseDeck(raw);
    }
    return defaultDeck();
}

function saveDeck(scope, deck) {
    if (!scope || scope.readOnly) return;
    if (scope.kind === 'bb') {
        setSetting(`branchAssets.${scope.branchId}.flashcard`, deck);
        return;
    }
    if (scope.kind === 'bc' && scope.localId != null) {
        // Fire-and-forget — Dexie update is fast; caller doesn't need
        // to await a persist just to render the next frame. A failure
        // here is logged but doesn't block the UI (the deck is still
        // in memory; next save has another chance). Mark the channel
        // dirty so the list icon flips to "unsynced" and the owner
        // knows a cast is owed.
        BCMeta.setFlashcards(scope.localId, deck).catch(err =>
            console.warn('[flashcard] BCMeta.setFlashcards failed', err)
        );
        BCChannel?._markLocalDirty?.();
    }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[c]);
}
function escapeAttr(s) { return escapeHtml(s); }

// ── State + shelf root ─────────────────────────────────────────────

let $shelfRoot = null;
let _currentDeck = defaultDeck();
let _currentScope = null;
let _view = 'maker';  // 'maker' | 'player'

// ── Maker view ─────────────────────────────────────────────────────

function renderMaker() {
    if (!$shelfRoot) return;
    const deck = _currentDeck;
    const title = _currentScope?.title || 'FLASHCARDS';

    $shelfRoot.innerHTML = `
        <div class="feature-panel" data-feature="flashcard">
            <div class="feature-title fc-title">${escapeHtml(title)} ${t('flashcards.titleSuffix')}</div>

            <div class="fc-add-row">
                <input type="text" class="fc-add-front" placeholder="${escapeAttr(t('flashcards.frontPlaceholder'))}" />
                <input type="text" class="fc-add-back"  placeholder="${escapeAttr(t('flashcards.backPlaceholder'))}" />
                <button class="fc-add-btn">${t('flashcards.addBtn')}</button>
            </div>

            <div class="fc-list-label">${t('flashcards.listLabel', { count: deck.cards.length })}</div>
            <div class="fc-list">
                ${deck.cards.length === 0
                    ? `<div class="fc-list-empty">${t('flashcards.empty')}</div>`
                    : deck.cards.map((c, i) => `
                        <div class="fc-item" data-idx="${i}">
                            <div class="fc-item-front">${escapeHtml(c.front)}</div>
                            <div class="fc-item-divider">│</div>
                            <div class="fc-item-back">${escapeHtml(c.back)}</div>
                            <button class="fc-item-remove" data-idx="${i}" aria-label="remove">×</button>
                        </div>
                    `).join('')}
            </div>

            <div class="fc-actions">
                <button class="fc-play-btn" ${deck.cards.length === 0 ? 'disabled' : ''}>
                    <span class="fc-play-icon">▶</span> ${t('flashcards.playBtn')}
                </button>
                <button class="fc-reset-btn" ${deck.cards.length === 0 ? 'disabled' : ''}
                        aria-label="${escapeAttr(t('flashcards.resetBtn'))}"></button>
            </div>
        </div>
    `;

    wireMaker();
}

function wireMaker() {
    const $front = $shelfRoot.querySelector('.fc-add-front');
    const $back  = $shelfRoot.querySelector('.fc-add-back');
    const $addBtn = $shelfRoot.querySelector('.fc-add-btn');

    const submitAdd = () => {
        const front = ($front?.value || '').trim();
        const back  = ($back?.value  || '').trim();
        if (!front && !back) return;
        _currentDeck.cards.push({ front, back });
        saveDeck(_currentScope, _currentDeck);
        renderMaker();
    };
    $addBtn?.addEventListener('click', submitAdd);
    [$front, $back].forEach(el => {
        el?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submitAdd(); }
        });
    });

    $shelfRoot.querySelectorAll('.fc-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx, 10);
            if (Number.isNaN(idx)) return;
            _currentDeck.cards.splice(idx, 1);
            if (_currentDeck.playState.currentIdx >= _currentDeck.cards.length) {
                _currentDeck.playState.currentIdx = Math.max(0, _currentDeck.cards.length - 1);
            }
            saveDeck(_currentScope, _currentDeck);
            renderMaker();
        });
    });

    $shelfRoot.querySelector('.fc-play-btn')?.addEventListener('click', () => {
        if (_currentDeck.cards.length === 0) return;
        _view = 'player';
        renderPlayer();
    });

    // RESET — one-step destructive per Tier 22.14. Wipes the deck on a
    // single click. Button is disabled while deck is empty so there's
    // nothing to wipe accidentally.
    $shelfRoot.querySelector('.fc-reset-btn')?.addEventListener('click', () => {
        if (_currentDeck.cards.length === 0) return;
        _currentDeck = defaultDeck();
        saveDeck(_currentScope, _currentDeck);
        renderMaker();
        BBMessage.info(t('flashcards.resetComplete'));
    });
}

// ── Player view (shelf-local) ──────────────────────────────────────

function renderPlayer() {
    if (!$shelfRoot) return;
    const deck = _currentDeck;
    if (deck.cards.length === 0) { _view = 'maker'; renderMaker(); return; }

    const idx = Math.min(deck.playState.currentIdx, deck.cards.length - 1);
    const card = deck.cards[idx];
    const isFlipped = deck.playState.face === 'back';

    // Reader has no Maker to go back to — hide the BACK control so
    // subscribers don't land on an edit UI whose saves silently no-op.
    const showBackBtn = !_currentScope?.readOnly;

    $shelfRoot.innerHTML = `
        <div class="feature-panel" data-feature="flashcard">
            <div class="fc-player-top">
                ${showBackBtn
                    ? `<button class="fc-back-btn" aria-label="${escapeAttr(t('flashcards.backToMaker'))}">⟵ ${t('flashcards.backToMaker')}</button>`
                    : `<span class="fc-reader-badge">${t('flashcards.readerBadge')}</span>`}
                <div class="fc-player-counter">${idx + 1} / ${deck.cards.length}</div>
            </div>

            <div class="fc-stage">
                <div class="fc-card ${isFlipped ? 'is-flipped' : ''}">
                    <div class="fc-face fc-face-front">${escapeHtml(card.front)}</div>
                    <div class="fc-face fc-face-back">${escapeHtml(card.back)}</div>
                </div>
                <div class="fc-flip-hint">${t('flashcards.flipHint')}</div>
            </div>

            <div class="fc-player-nav">
                <button class="fc-prev-btn" aria-label="${escapeAttr(t('common.pull'))}">⟵</button>
                <button class="fc-mode-toggle" aria-label="${escapeAttr(t('flashcards.modeLabel'))}">
                    <span class="fc-mode-current">${deck.mode === 'random' ? t('flashcards.modeRandom') : t('flashcards.modeSequential')}</span>
                    <span class="fc-mode-swap-icon">⟳</span>
                </button>
                <button class="fc-next-btn" aria-label="${escapeAttr(t('common.push'))}">⟶</button>
            </div>
        </div>
    `;

    wirePlayer();
}

function wirePlayer() {
    // BACK → Maker
    $shelfRoot.querySelector('.fc-back-btn')?.addEventListener('click', () => {
        _view = 'maker';
        renderMaker();
    });

    // Card click → flip
    $shelfRoot.querySelector('.fc-card')?.addEventListener('click', flipCard);

    // Nav buttons
    $shelfRoot.querySelector('.fc-prev-btn')?.addEventListener('click', () => navigate(-1));
    $shelfRoot.querySelector('.fc-next-btn')?.addEventListener('click', () => navigate(+1));

    // Mode toggle — single button flips between SEQUENTIAL ↔ RANDOM.
    // Label shows the CURRENT mode; click flips to the other.
    $shelfRoot.querySelector('.fc-mode-toggle')?.addEventListener('click', () => {
        _currentDeck.mode = _currentDeck.mode === 'sequential' ? 'random' : 'sequential';
        // Reset history when switching into random so the stack starts clean.
        if (_currentDeck.mode === 'random') _currentDeck.playState.randomHistory = [];
        saveDeck(_currentScope, _currentDeck);
        renderPlayer();
    });
}

function flipCard() {
    if (_currentDeck.cards.length === 0) return;
    _currentDeck.playState.face = _currentDeck.playState.face === 'front' ? 'back' : 'front';
    saveDeck(_currentScope, _currentDeck);
    $shelfRoot.querySelector('.fc-card')?.classList.toggle('is-flipped', _currentDeck.playState.face === 'back');
}

function navigate(direction) {
    const deck = _currentDeck;
    if (!deck || deck.cards.length === 0) return;
    const n = deck.cards.length;
    const curr = deck.playState.currentIdx;

    if (deck.mode === 'sequential') {
        deck.playState.currentIdx = (curr + direction + n) % n;
    } else {
        const hist = Array.isArray(deck.playState.randomHistory) ? deck.playState.randomHistory : [];
        if (direction === +1) {
            hist.push(curr);
            if (hist.length > 10) hist.shift();
            let next = Math.floor(Math.random() * n);
            if (n > 1 && next === curr) next = (next + 1) % n;
            deck.playState.currentIdx = next;
        } else {
            if (hist.length > 0) {
                deck.playState.currentIdx = hist.pop();
            } else {
                let next = Math.floor(Math.random() * n);
                if (n > 1 && next === curr) next = (next + 1) % n;
                deck.playState.currentIdx = next;
            }
        }
        deck.playState.randomHistory = hist;
    }
    deck.playState.face = 'front';
    saveDeck(_currentScope, _currentDeck);
    renderPlayer();
}

// ── Keyboard + swipe (Player only, when shelf is visible) ──────────

function isPlayerVisible() {
    return _view === 'player' && $shelfRoot && $shelfRoot.offsetParent !== null;
}

document.addEventListener('keydown', (e) => {
    if (!isPlayerVisible()) return;
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowLeft')       { e.preventDefault(); navigate(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); navigate(+1); }
    else if (e.key === ' ')          { e.preventDefault(); flipCard(); }
});

// Swipe on card — attached per-render inside wirePlayer via event
// delegation would be cleaner; simpler to bind at document and check
// target membership.
let _touchStartX = null, _touchStartY = null, _touchMoved = false;
document.addEventListener('touchstart', (e) => {
    if (!isPlayerVisible()) return;
    const card = e.target.closest?.('.fc-card');
    if (!card) return;
    const t = e.touches[0];
    _touchStartX = t.clientX; _touchStartY = t.clientY; _touchMoved = false;
}, { passive: true });
document.addEventListener('touchmove', (e) => {
    if (_touchStartX == null) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - _touchStartX) > 10 || Math.abs(t.clientY - _touchStartY) > 10) _touchMoved = true;
}, { passive: true });
document.addEventListener('touchend', (e) => {
    if (_touchStartX == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - _touchStartX;
    const dy = t.clientY - _touchStartY;
    const moved = _touchMoved;
    _touchStartX = null; _touchStartY = null;
    if (!moved) return;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        navigate(dx > 0 ? -1 : +1);
    }
});

// ── Feature export ─────────────────────────────────────────────────

export const feature = {
    id: 'flashcard',
    iconUrl: ICON_URL,
    pages: ['blackboard-log', 'broadcast-channel'],
    hasShelf: true,

    initShelf($shelf) {
        $shelfRoot = $shelf;
        $shelf.innerHTML = `<div class="feature-panel" data-feature="flashcard">
            <div class="feature-title">FLASHCARDS</div>
            <div class="feature-placeholder">${t('flashcards.loading')}</div>
        </div>`;
    },

    async onOpen($shelf) {
        $shelfRoot = $shelf;
        _currentScope = resolveScope();
        if (!_currentScope) {
            $shelf.innerHTML = `<div class="feature-panel" data-feature="flashcard">
                <div class="feature-title">FLASHCARDS</div>
                <div class="feature-placeholder">${t('flashcards.unavailable')}</div>
            </div>`;
            return;
        }
        _currentDeck = await loadDeck(_currentScope);

        // Reader skips the Maker entirely. An empty deck shows a
        // read-only placeholder (nothing to study); a non-empty deck
        // opens directly into the Player. Owner and BB paths keep
        // the existing Maker-first flow.
        if (_currentScope.readOnly) {
            if (_currentDeck.cards.length === 0) {
                $shelf.innerHTML = `<div class="feature-panel" data-feature="flashcard">
                    <div class="feature-title fc-title">${escapeHtml(_currentScope.title || 'FLASHCARDS')} ${t('flashcards.titleSuffix')}</div>
                    <div class="feature-placeholder">${t('flashcards.readerEmpty')}</div>
                </div>`;
                return;
            }
            _view = 'player';
            renderPlayer();
            return;
        }

        _view = 'maker';
        renderMaker();

        // Owner-side cross-device refresh. If the channel has no
        // pending local edits (`isDirty === false`), pull the
        // current server deck and overwrite BCMeta — so a device
        // that didn't cast the latest version still catches up the
        // moment the owner opens the shelf. When dirty, SKIP — local
        // has unsent work we must not clobber.
        //
        // Runs AFTER the initial render so the user sees their local
        // copy immediately; a fresher server deck swaps in a frame
        // later via re-render.
        if (_currentScope.kind === 'bc' && _currentScope.serverChannelId) {
            refreshOwnerDeckFromServer(_currentScope).catch(err =>
                console.warn('[flashcard] owner refresh failed', err)
            );
        }
    },
};

/**
 * Background refresh for BC owner: compare server deck to local,
 * adopt server if differs AND channel isn't dirty. Skips entirely
 * on dirty channels (local has unsent edits = local is newer).
 *
 * Called fire-and-forget from onOpen. A later user edit races against
 * this refresh: saveDeck will overwrite whatever we write here, which
 * is correct — the user's in-flight input wins over a stale async
 * fetch result.
 */
async function refreshOwnerDeckFromServer(scope) {
    // Guard: another shelf-open swapped scope while we were awaiting.
    if (scope !== _currentScope) return;

    const dirty = await BCMeta.isDirty(scope.localId);
    if (dirty) return;  // Don't clobber unsent local work.

    const res = await BroadcastFlashcardsService.fetch(scope.serverChannelId);
    // `flashcards: []` means "no deck set" on the server; treat as null.
    const serverRaw = res?.flashcards;
    const serverDeck = normaliseDeck(
        (serverRaw && typeof serverRaw === 'object' && !Array.isArray(serverRaw))
            ? serverRaw : null
    );

    // Scope may have changed while awaiting (user switched channels).
    if (scope !== _currentScope) return;

    // Compare the meaningful part of the deck (cards) — playState
    // differences between devices are expected and not a trigger to
    // re-render.
    const localCardsJson = JSON.stringify(_currentDeck.cards);
    const serverCardsJson = JSON.stringify(serverDeck.cards);
    if (localCardsJson === serverCardsJson) return;

    // Adopt server deck. Write to BCMeta so the next open reads the
    // fresh value from local cache; re-render shelf so the user sees
    // the refreshed deck immediately.
    _currentDeck = serverDeck;
    await BCMeta.setFlashcards(scope.localId, serverDeck);

    // Re-render whichever view the user is on.
    if (_view === 'player' && _currentDeck.cards.length > 0) {
        renderPlayer();
    } else {
        _view = 'maker';
        renderMaker();
    }
}
