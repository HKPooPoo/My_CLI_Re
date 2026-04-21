/**
 * Feature: Flashcard Maker + Player (per-branch)
 * Stub — Tier 9 populates maker form, card list, play mode takeover.
 */

const ICON_URL = '/images/flashcard.svg';

export const feature = {
    id: 'flashcard',
    iconUrl: ICON_URL,
    pages: ['blackboard-log', 'broadcast-channel'],
    hasShelf: true,
    initShelf($shelf) {
        $shelf.innerHTML = `
            <div class="feature-panel" data-feature="flashcard">
                <div class="feature-title">FLASHCARD</div>
                <div class="feature-placeholder">Maker + Player — coming in Tier 9</div>
            </div>
        `;
    },
    onOpen(_$shelf) {
        // Tier 9 will load branch-scoped flashcard data here
    },
};
