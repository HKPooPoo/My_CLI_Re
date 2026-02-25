/**
 * MOD Service - API facade for MOD health checks
 * =================================================================
 */

import { apiRequest } from './api.js';

export const ModService = {
    /**
     * @param {string} endpoint — relative path like '/mods/offline-translate/health' (apiRequest adds /api)
     */
    checkHealth(endpoint) {
        return apiRequest(endpoint);
    }
};
