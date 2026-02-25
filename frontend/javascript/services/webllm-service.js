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

        const temperature = opts.temperature ?? 0.3;
        const maxTokens = opts.maxTokens ?? 2048;
        const signal = opts.signal;

        // Qwen3: disable thinking mode for small models (better instruction following)
        // Prepend /no_think to user message content and set extra_body
        const processedMessages = messages.map(m => {
            if (m.role === 'user') {
                return { ...m, content: '/no_think\n' + m.content };
            }
            return m;
        });

        const requestParams = {
            messages: processedMessages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
            stream_options: { include_usage: true },
            extra_body: { enable_thinking: false },
        };

        const chunks = await _engine.chat.completions.create(requestParams);

        const t0 = performance.now();
        let answerTokens = 0;
        let inThink = false;

        for await (const chunk of chunks) {
            if (signal?.aborted) break;

            const delta = chunk.choices[0]?.delta?.content || '';
            if (!delta) continue;

            // Strip <think>...</think> blocks from Qwen3 output
            if (delta.includes('<think>')) { inThink = true; continue; }
            if (delta.includes('</think>')) { inThink = false; continue; }
            if (inThink) continue;

            // Skip leading newlines after think block
            const cleaned = answerTokens === 0 ? delta.replace(/^\n+/, '') : delta;
            if (!cleaned) continue;

            answerTokens++;

            yield {
                delta: cleaned,
                done: false,
                meta: { answerTokens, elapsed: ((performance.now() - t0) / 1000).toFixed(1) },
            };
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
