/**
 * User Settings Service — cross-device sync over /api/user/settings.
 *
 * Thin HTTP wrapper. The sync lifecycle (debounce, login-triggered
 * fetch, in-memory mirror) lives in sync-service.js.
 */

import { apiRequest } from './api.js';

export const UserSettingsService = {
    fetch() {
        return apiRequest('/user/settings');
    },

    update(settings) {
        return apiRequest('/user/settings', {
            method: 'PUT',
            body: JSON.stringify({ settings }),
        });
    },
};
