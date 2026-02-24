import { apiRequest } from './api.js';

export const BroadcastService = {
    listChannels(signal) {
        return apiRequest('/broadcast/channels', signal ? { signal } : {});
    },
    cast(data) {
        return apiRequest('/broadcast/channels/cast', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    rename(channelId, data) {
        return apiRequest(`/broadcast/channels/${channelId}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },
    destroy(channelId) {
        return apiRequest(`/broadcast/channels/${channelId}`, { method: 'DELETE' });
    },
    fetchBoards(channelId) {
        return apiRequest(`/broadcast/channels/${channelId}/boards`, { method: 'GET' });
    },
    pin(channelId) {
        return apiRequest(`/broadcast/channels/${channelId}/pin`, { method: 'POST' });
    },
    unpin(channelId) {
        return apiRequest(`/broadcast/channels/${channelId}/pin`, { method: 'DELETE' });
    }
};
