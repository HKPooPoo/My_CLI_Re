import { apiRequest } from './api.js';

export const SpeechService = {
    recognize(data) {
        return apiRequest('/speech', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};
