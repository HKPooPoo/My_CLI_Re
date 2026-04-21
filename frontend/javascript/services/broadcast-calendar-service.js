/**
 * BC channel calendar read-only service.
 *
 * Write path is through the CAST endpoint (bundled with records).
 * This service exposes a fresh-fetch GET only, used by:
 *   - Subscribers who want to read a channel's calendar on demand
 *   - Dashboard rollup for pinned channels
 */

import { apiRequest } from './api.js';

export const BroadcastCalendarService = {
    fetch(channelId) {
        return apiRequest(`/broadcast/channels/${channelId}/calendar`);
    },
};
