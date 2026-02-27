/**
 * WebLLM Service — Browser-side LLM engine singleton
 * ====================================================
 * Uses @mlc-ai/web-llm (WebGPU) for client-side inference.
 * Lazy-loads the library from CDN on first use.
 *
 * API:
 *   ensureModel(modelId, onProgress) → void
 *   chat(messages, opts) → AsyncGenerator<{ delta, done, meta }>
 *   unload() → void
 *   getLoadedModel() → string|null
 *   isSupported() → boolean
 */

let _webllm = null;   // lazily imported module
let _engine = null;    // MLCEngine instance
let _currentModel = null;
let _loading = false;

/** Detect WASM engine corruption (freed tokenizer, unloaded model). */
function _isEngineCorrupted(e) {
    const msg = e?.message || '';
    return msg.includes('deleted object') || msg.includes('not loaded') || msg.includes('Tokenizer');
}

/**
 * Lazy-import WebLLM from CDN (cached by browser after first fetch).
 */
async function _importWebLLM() {
    if (!_webllm) {
        _webllm = await import('https://esm.run/@mlc-ai/web-llm');
    }
    return _webllm;
}

export const WebLlmService = {

    /** @returns {boolean} Whether this browser supports WebGPU */
    isSupported() {
        return !!navigator.gpu;
    },

    /** @returns {string|null} Currently loaded model ID, or null */
    getLoadedModel() {
        return _currentModel;
    },

    /**
     * Ensure a model is loaded into the engine.
     * If already loaded with the same modelId, resolves instantly.
     * If a different model was loaded, reloads the engine.
     *
     * @param {string} modelId  - MLC model identifier
     * @param {(text: string) => void} [onProgress] - progress callback
     */
    async ensureModel(modelId, onProgress) {
        if (_currentModel === modelId && _engine) return;
        if (_loading) throw new Error('Model is already loading');

        _loading = true;
        try {
            const webllm = await _importWebLLM();

            // If engine exists with a different model, reset it
            if (_engine) {
                try { await _engine.unload(); } catch { /* ignore */ }
                _engine = null;
                _currentModel = null;
            }

            _engine = await webllm.CreateMLCEngine(modelId, {
                initProgressCallback: (p) => {
                    if (onProgress) onProgress(p.text || JSON.stringify(p));
                },
            });

            _currentModel = modelId;
        } finally {
            _loading = false;
        }
    },

    /**
     * Streaming chat completion.
     *
     * @param {Array<{role: string, content: string}>} messages
     * @param {object} [opts]
     * @param {number} [opts.temperature=0.3]
     * @param {number} [opts.maxTokens=2048]
     * @param {AbortSignal} [opts.signal] - AbortController signal
     * @yields {{ delta: string, done: boolean, meta: object }}
     */
    async *chat(messages, opts = {}) {
        if (!_engine || !_currentModel) {
            throw new Error('No model loaded. Call ensureModel() first.');
        }

        // Stop any in-flight generation before starting a new one
        _engine.interruptGenerate?.();

        const temperature = opts.temperature ?? 0.3;
        const maxTokens = opts.maxTokens ?? 2048;
        const signal = opts.signal;

        // Qwen3: disable thinking via extra_body (API-level flag).
        // /no_think text prefix is handled by the caller in buildMessages().
        const isQwen3 = _currentModel.toLowerCase().includes('qwen3');

        const requestParams = {
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
            stream_options: { include_usage: true },
            ...(isQwen3 && { extra_body: { enable_thinking: false } }),
        };

        let chunks;
        try {
            chunks = await _engine.chat.completions.create(requestParams);
        } catch (e) {
            if (_isEngineCorrupted(e)) {
                _engine = null;
                _currentModel = null;
            }
            throw e;
        }

        const t0 = performance.now();
        let answerTokens = 0;

        try {
            for await (const chunk of chunks) {
                if (signal?.aborted) break;

                const rawDelta = chunk.choices[0]?.delta?.content || '';
                if (!rawDelta) continue;

                // Strip <think> / </think> tags but KEEP content between them.
                // Small models (0.6B) put the answer inside think blocks.
                const text = rawDelta.replace(/<\/?think>/g, '');
                if (!text) continue;

                // Skip leading newlines (common after think tags)
                const cleaned = answerTokens === 0 ? text.replace(/^\n+/, '') : text;
                if (!cleaned) continue;

                answerTokens++;

                yield {
                    delta: cleaned,
                    done: false,
                    meta: { answerTokens, elapsed: ((performance.now() - t0) / 1000).toFixed(1) },
                };
            }
        } catch (e) {
            if (_isEngineCorrupted(e)) {
                _engine = null;
                _currentModel = null;
            }
            throw e;
        }

        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
        yield {
            delta: '',
            done: true,
            meta: {
                answerTokens,
                elapsed,
                tokensPerSecond: answerTokens > 0 ? (answerTokens / parseFloat(elapsed)).toFixed(1) : '0',
                model: _currentModel,
            },
        };
    },

    /**
     * Unload current model and free GPU memory.
     */
    async unload() {
        if (_engine) {
            try { await _engine.unload(); } catch { /* ignore */ }
            _engine = null;
            _currentModel = null;
        }
    },
};
