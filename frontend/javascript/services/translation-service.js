import { apiRequest } from './api.js';

export const TranslationService = {
    translate(data) {
        return apiRequest('/translate', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};
