import { apiRequest } from './api.js';

export const LlmService = {
    chat(data, { signal } = {}) {
        return apiRequest('/mods/llm/chat', {
            method: 'POST',
            body: JSON.stringify(data),
            signal,
        });
    },

    async *chatStream(data, { signal } = {}) {
        const response = await fetch('/api/mods/llm/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
            credentials: 'same-origin',
            body: JSON.stringify(data),
            signal,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const payload = line.slice(6).trim();
                    if (!payload) continue;
                    yield JSON.parse(payload);
                }
            }
        } finally {
            reader.releaseLock();
        }
    },

    ollamaHealth() {
        return apiRequest('/mods/llm/ollama/health');
    },
};
