#!/bin/sh
# Ollama entrypoint: start server, auto-pull required model, keep running.
# Model is cached in the ollama-data volume — pull is a no-op after first run.

REQUIRED_MODEL="${OLLAMA_MODEL:-qwen3.5:4b}"

# Start Ollama server in background
ollama serve &
SERVER_PID=$!

# Wait for server to be ready
echo "[ollama-entrypoint] Waiting for Ollama server..."
i=0
while [ $i -lt 30 ]; do
    if curl -sf http://localhost:11434/ > /dev/null 2>&1; then
        echo "[ollama-entrypoint] Server ready."
        break
    fi
    i=$((i + 1))
    sleep 1
done

# Pull model (no-op if already cached)
echo "[ollama-entrypoint] Ensuring model: $REQUIRED_MODEL"
ollama pull "$REQUIRED_MODEL"

# Keep server in foreground
wait $SERVER_PID
