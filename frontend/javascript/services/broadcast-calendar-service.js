/**
 * BC channel calendar — per-channel calendar dict stored in
 * broadcast_channels.calendar. GET is public (guests / subscribers
 * can read); PUT requires the user to be the channel owner.
 */

import { apiRequest } from './api.js';

export const BroadcastCalendarService = {
    fetch(channelId) {
        return apiRequest(`/broadcast/channels/${channelId}/calendar`);
    },

    update(channelId, calendar) {
        return apiRequest(`/broadcast/channels/${channelId}/calendar`, {
            method: 'PUT',
            body: JSON.stringify({ calendar }),
        });
    },
};
