/**
 * MOD Service - API facade for MOD health checks
 * =================================================================
 */

import { apiRequest } from './api.js';

export const ModService = {
    /**
     * @param {string} endpoint — full path like '/api/mods/offline-translate/health'
     */
    checkHealth(endpoint) {
        return apiRequest(endpoint);
    }
};
