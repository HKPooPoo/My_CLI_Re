/**
 * MOD Service - API facade for MOD health checks
 * =================================================================
 */

import { apiRequest } from './api.js';

export const ModService = {
    checkHealth(modId) {
        return apiRequest(`/mods/${modId}/health`);
    }
};
