import { apiRequest } from './api.js';

export const StatusService = {
    checkStatus() {
        return apiRequest('/status', { method: 'GET' });
    }
};
