import { apiRequest } from './api.js';

export const LlmService = {
    chat(data, { signal } = {}) {
        return apiRequest('/mods/llm/chat', {
            method: 'POST',
            body: JSON.stringify(data),
            signal,
            timeout: 120000, // 2 min — LLM inference can be slow
        });
    },

    async *chatStream(data, { signal, connectTimeout = 15000 } = {}) {
        // Connection-phase timeout: abort if server doesn't respond within connectTimeout.
        // Once first chunk arrives, cancel the timer (stream can run as long as needed).
        const connectController = new AbortController();
        const timeoutId = setTimeout(() => connectController.abort(), connectTimeout);

        // If caller aborts, also abort connection
        const onCallerAbort = () => connectController.abort();
        signal?.addEventListener('abort', onCallerAbort);

        let response;
        try {
            response = await fetch('/api/mods/llm/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
                credentials: 'same-origin',
                body: JSON.stringify(data),
                signal: connectController.signal,
            });
        } catch (e) {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', onCallerAbort);
            if (e.name === 'AbortError' && !signal?.aborted) {
                throw new Error('Connection timed out');
            }
            throw e;
        }

        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', onCallerAbort);

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
                if (signal?.aborted) break;

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
