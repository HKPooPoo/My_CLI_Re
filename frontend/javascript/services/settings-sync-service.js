/**
 * Settings Sync Service
 * =================================================================
 * Handles push/pull of settings to/from server.
 * Push: auto on change (debounced via settings.js onPush callback).
 * Pull: auto on login.
 * =================================================================
 */

import { apiRequest } from './api.js';
import * as Settings from '../settings.js';

export const SettingsSyncService = {
    async push() {
        const user = localStorage.getItem('currentUser');
        if (!user) return;

        try {
            const data = Settings.getAllForSync();
            await apiRequest('/settings', {
                method: 'POST',
                body: JSON.stringify({ settings: data }),
            });
        } catch (e) {
            // Silent failure — settings will be pushed on next change
            console.warn('SettingsSync: push failed', e);
        }
    },

    async pull() {
        try {
            const data = await apiRequest('/settings', { method: 'GET' });
            if (data?.settings) {
                Settings.importAll(data.settings);
                return true;
            }
            return false;
        } catch (e) {
            console.warn('SettingsSync: pull failed', e);
            return false;
        }
    },

    init() {
        // Register auto-push callback in settings.js
        Settings.onPush(() => this.push());
    }
};

SettingsSyncService.init();
