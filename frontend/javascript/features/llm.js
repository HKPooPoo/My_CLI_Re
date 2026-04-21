/**
 * Feature: AI Tutor (LLM)
 * Stub — Tier 9 populates dropdown, prompt preview, send button, output stream.
 */

const ICON_URL = '/images/ai-tutor.svg';

export const feature = {
    id: 'llm',
    iconUrl: ICON_URL,
    pages: ['blackboard-log', 'broadcast-channel'],
    hasShelf: true,
    initShelf($shelf) {
        $shelf.innerHTML = `
            <div class="feature-panel" data-feature="llm">
                <div class="feature-title">AI TUTOR</div>
                <div class="feature-placeholder">LLM shelf — coming in Tier 9</div>
            </div>
        `;
    },
    onOpen(_$shelf) {
        // Tier 9 will hydrate dropdown state here
    },
};
