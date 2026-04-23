/**
 * Feature: Flashcard Maker + Player (shelf-local)
 * =================================================================
 * Tier 9d-5 (revised from 9d-2): Player no longer takes over the
 * press-start-overlay — it lives INSIDE the same shelf panel as
 * the Maker, toggled by the PLAY / BACK controls. Keeps the user
 * inside one UI surface (less context-switch, fewer stacking
 * layers to debug).
 *
 * Data shape (unchanged):
 *     {
 *         cards: [{ front, back }, ...],
 *         mode:  "sequential" | "random",
 *         playState: { currentIdx, face, randomHistory }
 *     }
 *
 * BB path uses sync-service (cross-device). BC extension point
 * stays in resolveScope(); Tier 9e-2 will populate it.
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
        return { kind: 'bb', branchId, title: (BBState?.branch || 'NOTEBOOK') };
    }
    return null;
}

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

    $shelfRoot.innerHTML = `
        <div class="feature-panel" data-feature="flashcard">
            <div class="fc-player-top">
                <button class="fc-back-btn" aria-label="${escapeAttr(t('flashcards.backToMaker'))}">⟵ ${t('flashcards.backToMaker')}</button>
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
        _view = 'maker';
        renderMaker();
    },
};
