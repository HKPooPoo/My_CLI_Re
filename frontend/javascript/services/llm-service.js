import { apiRequest } from './api.js';

export const LlmService = {
    chat(data) {
        return apiRequest('/mods/llm/chat', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    ollamaHealth() {
        return apiRequest('/mods/llm/ollama/health');
    },
};
