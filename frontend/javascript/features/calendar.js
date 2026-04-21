/**
 * Feature: Calendar (per-branch)
 * Stub — Tier 9 populates month grid, day editor, data persistence.
 */

const ICON_URL = '/images/calendar.svg';

export const feature = {
    id: 'calendar',
    iconUrl: ICON_URL,
    pages: ['blackboard-log', 'broadcast-channel'],
    hasShelf: true,
    initShelf($shelf) {
        $shelf.innerHTML = `
            <div class="feature-panel" data-feature="calendar">
                <div class="feature-title">CALENDAR</div>
                <div class="feature-placeholder">Per-branch calendar — coming in Tier 9</div>
            </div>
        `;
    },
    onOpen(_$shelf) {
        // Tier 9 will load branch-scoped calendar data here
    },
};
