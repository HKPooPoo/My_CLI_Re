/**
 * Feature: Flashcard Maker + Player
 * =================================================================
 * Tier 9d-1: BB Maker in shelf; data persisted via sync-service
 *            at users.settings.branchAssets[branchId].flashcard.
 * Tier 9d-2: Player overlay (press-start-overlay + .flashcard-mode).
 * Tier 9e : BC owner/subscriber flashcards (separate tier — uses
 *            broadcast_channels.flashcards JSONB via cast cadence).
 *
 * Data shape:
 *     {
 *         cards: [{ front, back }, ...],
 *         mode:  "sequential" | "random",
 *         playState: { currentIdx, face, randomHistory }
 *     }
 *
 * BB path uses sync-service (cross-device).  BC cast-bundle path is
 * added in Tier 9e-2 — this module already branches on the active
 * page so that extension plugs in cleanly.
 * =================================================================
 */

import { getSetting, setSetting } from '../sync-service.js';
import { BBState } from '../blackboard.js';
import { BBMessage } from '../blackboard-msg.js';
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
    // Clamp currentIdx to valid range
    if (deck.cards.length === 0) deck.playState.currentIdx = 0;
    else if (deck.playState.currentIdx >= deck.cards.length) deck.playState.currentIdx = deck.cards.length - 1;
    else if (deck.playState.currentIdx < 0) deck.playState.currentIdx = 0;
    return deck;
}

// ── Context: which board + which scope ─────────────────────────────

function getActivePage() {
    return document.querySelector('.page.active')?.dataset.page || null;
}

function resolveScope() {
    const page = getActivePage();
    if (page === 'blackboard-log') {
        const branchId = BBState?.branchId;
        if (!branchId) return null;
        return { kind: 'bb', branchId, title: (BBState?.branch || 'NOTEBOOK') };
    }
    // BC resolution is wired in Tier 9e-2; BB-only for now.
    return null;
}

// ── Load / Save ────────────────────────────────────────────────────

function loadDeck(scope) {
    if (!scope) return defaultDeck();
    if (scope.kind === 'bb') {
        const raw = getSetting(`branchAssets.${scope.branchId}.flashcard`, null);
        return normaliseDeck(raw);
    }
    return defaultDeck();
}

function saveDeck(scope, deck) {
    if (!scope) return;
    if (scope.kind === 'bb') {
        setSetting(`branchAssets.${scope.branchId}.flashcard`, deck);
    }
    // BC save in Tier 9e-2.
}

// ── Shelf UI (Maker) ───────────────────────────────────────────────

let $shelfRoot = null;
let _currentDeck = defaultDeck();
let _currentScope = null;

function render() {
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

            <div class="fc-mode-row">
                <span class="fc-mode-label">${t('flashcards.modeLabel')}</span>
                <button class="fc-mode-btn ${deck.mode === 'sequential' ? 'active' : ''}" data-mode="sequential">${t('flashcards.modeSequential')}</button>
                <button class="fc-mode-btn ${deck.mode === 'random'     ? 'active' : ''}" data-mode="random">${t('flashcards.modeRandom')}</button>
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

    wireEvents();
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[c]);
}
function escapeAttr(s) { return escapeHtml(s); }

// ── Event wiring ───────────────────────────────────────────────────

function wireEvents() {
    if (!$shelfRoot) return;
    const $front = $shelfRoot.querySelector('.fc-add-front');
    const $back  = $shelfRoot.querySelector('.fc-add-back');
    const $addBtn = $shelfRoot.querySelector('.fc-add-btn');

    const submitAdd = () => {
        const front = ($front?.value || '').trim();
        const back  = ($back?.value  || '').trim();
        if (!front && !back) return;
        _currentDeck.cards.push({ front, back });
        saveDeck(_currentScope, _currentDeck);
        render();
    };
    $addBtn?.addEventListener('click', submitAdd);
    [$front, $back].forEach(el => {
        el?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submitAdd(); }
        });
    });

    $shelfRoot.querySelectorAll('.fc-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode !== 'sequential' && mode !== 'random') return;
            _currentDeck.mode = mode;
            saveDeck(_currentScope, _currentDeck);
            render();
        });
    });

    $shelfRoot.querySelectorAll('.fc-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx, 10);
            if (Number.isNaN(idx)) return;
            _currentDeck.cards.splice(idx, 1);
            // Clamp currentIdx if it now exceeds the deck
            if (_currentDeck.playState.currentIdx >= _currentDeck.cards.length) {
                _currentDeck.playState.currentIdx = Math.max(0, _currentDeck.cards.length - 1);
            }
            saveDeck(_currentScope, _currentDeck);
            render();
        });
    });

    // PLAY — Tier 9d-2 hook. Opens full-screen Player overlay.
    $shelfRoot.querySelector('.fc-play-btn')?.addEventListener('click', () => {
        if (_currentDeck.cards.length === 0) return;
        openPlayer();
    });

    // RESET — wipes all cards (3-step destructive, same pattern as
    // delete-page-btn). We use a lightweight 3-click counter here
    // instead of MultiStepButton to avoid importing the whole module
    // for one button; the 3-click sequence is self-contained.
    const $resetBtn = $shelfRoot.querySelector('.fc-reset-btn');
    if ($resetBtn) attachResetBtn($resetBtn);
}

let _resetClickCount = 0;
let _resetTimer = null;
function attachResetBtn($btn) {
    $btn.addEventListener('click', () => {
        if (_currentDeck.cards.length === 0) return;
        _resetClickCount++;
        $btn.classList.add('btn-armed');
        clearTimeout(_resetTimer);
        if (_resetClickCount >= 3) {
            _resetClickCount = 0;
            $btn.classList.remove('btn-armed');
            _currentDeck = defaultDeck();
            saveDeck(_currentScope, _currentDeck);
            render();
            BBMessage.info(t('flashcards.resetComplete'));
            return;
        }
        _resetTimer = setTimeout(() => {
            _resetClickCount = 0;
            $btn.classList.remove('btn-armed');
        }, 3000);
    });
}

// ── Player overlay (Tier 9d-2) ─────────────────────────────────────
// Uses #press-start-overlay with .flashcard-mode class (same multi-
// modal pattern dashboard already uses). Sequential navigation wired
// here; random mode handler lands in Tier 9d-3 alongside keyboard +
// mobile swipe support.

const $overlay      = () => document.getElementById('press-start-overlay');
const $card         = () => document.getElementById('flashcard-card');
const $frontFace    = () => document.querySelector('#flashcard-card .flashcard-face-front');
const $backFace     = () => document.querySelector('#flashcard-card .flashcard-face-back');
const $counter      = () => document.getElementById('flashcard-counter');
const $modeLabel    = () => document.getElementById('flashcard-mode-label');
const $prevBtn      = () => document.getElementById('flashcard-prev-btn');
const $nextBtn      = () => document.getElementById('flashcard-next-btn');
const $closeBtn     = () => document.getElementById('flashcard-close-btn');

let _playerOpen = false;

function paintCard() {
    const deck = _currentDeck;
    if (!deck || deck.cards.length === 0) return;
    const idx = Math.min(deck.playState.currentIdx, deck.cards.length - 1);
    const card = deck.cards[idx];
    if ($frontFace()) $frontFace().textContent = card.front || '';
    if ($backFace())  $backFace().textContent  = card.back  || '';
    if ($counter())   $counter().textContent   = `${idx + 1} / ${deck.cards.length}`;
    if ($modeLabel()) $modeLabel().textContent = deck.mode === 'random'
        ? t('flashcards.modeRandom')
        : t('flashcards.modeSequential');

    // Reset flip state when navigating to a new card
    if ($card()) $card().classList.toggle('is-flipped', deck.playState.face === 'back');
}

function flipCard() {
    if (!_currentDeck || _currentDeck.cards.length === 0) return;
    const next = _currentDeck.playState.face === 'front' ? 'back' : 'front';
    _currentDeck.playState.face = next;
    saveDeck(_currentScope, _currentDeck);
    if ($card()) $card().classList.toggle('is-flipped', next === 'back');
}

function navigate(direction) {
    // direction: +1 = NEWER/forward, -1 = OLDER/backward
    const deck = _currentDeck;
    if (!deck || deck.cards.length === 0) return;
    const n = deck.cards.length;

    if (deck.mode === 'sequential') {
        const idx = deck.playState.currentIdx;
        const next = (idx + direction + n) % n;
        deck.playState.currentIdx = next;
    } else {
        // Tier 9d-3 will add proper random history stack; stub with
        // pure-random until then.
        let next = Math.floor(Math.random() * n);
        if (n > 1 && next === deck.playState.currentIdx) {
            next = (next + 1) % n;
        }
        deck.playState.currentIdx = next;
    }
    deck.playState.face = 'front';
    saveDeck(_currentScope, _currentDeck);
    paintCard();
}

function openPlayer() {
    if (_currentDeck.cards.length === 0) return;
    const ov = $overlay();
    if (!ov) return;
    // Mutually-exclusive with dashboard-mode: dismiss it explicitly
    // so the two panels never stack.
    ov.classList.remove('dashboard-mode');
    ov.classList.add('flashcard-mode');
    ov.style.display = 'flex';
    _playerOpen = true;
    paintCard();
    wirePlayerEvents();
}

function closePlayer() {
    const ov = $overlay();
    if (!ov) return;
    ov.classList.remove('flashcard-mode');
    ov.style.display = 'none';
    _playerOpen = false;
    // Defensive: drop any stray 'is-flipped' so next session starts
    // on the front regardless of last saved face.
    $card()?.classList.remove('is-flipped');
}

let _playerWired = false;
function wirePlayerEvents() {
    if (_playerWired) return;
    _playerWired = true;

    $card()?.addEventListener('click', flipCard);
    $prevBtn()?.addEventListener('click', () => navigate(-1));
    $nextBtn()?.addEventListener('click', () => navigate(+1));
    $closeBtn()?.addEventListener('click', closePlayer);

    // ESC closes (9d-3 adds arrow keys + Space-to-flip)
    document.addEventListener('keydown', (e) => {
        if (!_playerOpen) return;
        if (e.key === 'Escape') { e.preventDefault(); closePlayer(); }
    });
}

// ── Feature module export ──────────────────────────────────────────

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

    onOpen($shelf) {
        $shelfRoot = $shelf;
        _currentScope = resolveScope();
        if (!_currentScope) {
            $shelf.innerHTML = `<div class="feature-panel" data-feature="flashcard">
                <div class="feature-title">FLASHCARDS</div>
                <div class="feature-placeholder">${t('flashcards.unavailable')}</div>
            </div>`;
            return;
        }
        _currentDeck = loadDeck(_currentScope);
        render();
    },
};
