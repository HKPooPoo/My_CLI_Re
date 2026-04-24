/**
 * BC channel flashcards read-only service.
 *
 * Writes bundle with the CAST endpoint (same contract as calendar,
 * since both sit on the `broadcast_channels` JSONB columns with
 * LWW semantics). This service exposes a fresh-fetch GET only,
 * used by subscribers who want to study a channel's deck.
 */

import { apiRequest } from './api.js';

export const BroadcastFlashcardsService = {
    fetch(channelId) {
        return apiRequest(`/broadcast/channels/${channelId}/flashcards`);
    },
};
