<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class LlmController extends Controller
{
    /**
     * POST /api/mods/llm/chat
     *
     * Thin proxy: validate → route to provider → return normalized response.
     */
    public function chat(Request $request)
    {
        $validated = $request->validate([
            'provider' => 'required|string|in:ollama,openai,anthropic',
            'model' => 'required|string|max:100',
            'messages' => 'required|array|min:1',
            'messages.*.role' => 'required|string|in:system,user,assistant',
            'messages.*.content' => 'required|string',
            'temperature' => 'sometimes|numeric|min:0|max:2',
            'apiKey' => 'sometimes|nullable|string|max:200',
        ]);

        $provider = $validated['provider'];
        $model = $validated['model'];
        $messages = $validated['messages'];
        $temperature = $validated['temperature'] ?? 0.3;
        $apiKey = $validated['apiKey'] ?? '';

        try {
            $result = match ($provider) {
                'ollama' => $this->chatViaOllama($model, $messages, $temperature),
                'openai' => $this->chatViaOpenAI($model, $messages, $temperature, $apiKey),
                'anthropic' => $this->chatViaAnthropic($model, $messages, $temperature, $apiKey),
            };

            return response()->json([
                'content' => $result,
                'model' => $model,
                'provider' => $provider,
            ]);
        } catch (\Exception $e) {
            Log::error("LLM chat error ({$provider}): " . $e->getMessage());
            return response()->json([
                'error' => 'LLM provider request failed',
            ], 502);
        }
    }

    /**
     * POST /api/mods/llm/chat/stream
     *
     * SSE proxy: stream Ollama NDJSON → SSE data lines.
     */
    public function chatStream(Request $request)
    {
        $validated = $request->validate([
            'provider'           => 'required|string|in:ollama',
            'model'              => 'required|string|max:100',
            'messages'           => 'required|array|min:1',
            'messages.*.role'    => 'required|string|in:system,user,assistant',
            'messages.*.content' => 'required|string',
            'temperature'        => 'sometimes|numeric|min:0|max:2',
        ]);

        $url     = $this->ollamaUrl('/api/chat');
        $payload = json_encode([
            'model'      => $validated['model'],
            'messages'   => $validated['messages'],
            'stream'     => true,
            'think'      => false,
            'keep_alive' => '5m',
            'options'    => [
                'temperature'  => $validated['temperature'] ?? 0.3,
                'num_ctx'      => 2048,
                'num_predict'  => 2048,
            ],
        ]);

        return response()->stream(function () use ($url, $payload) {
            ignore_user_abort(false);

            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST          => true,
                CURLOPT_POSTFIELDS    => $payload,
                CURLOPT_HTTPHEADER    => ['Content-Type: application/json'],
                CURLOPT_TIMEOUT       => 300,
                CURLOPT_WRITEFUNCTION => function ($ch, $data) {
                    if (connection_aborted()) {
                        return 0; // Abort cURL transfer → frees worker + GPU
                    }

                    foreach (explode("\n", $data) as $line) {
                        $line = trim($line);
                        if ($line === '') continue;
                        $json = json_decode($line, true);
                        if (!$json) continue;

                        $content = $json['message']['content'] ?? '';
                        $done    = !empty($json['done']);

                        // Skip empty-content chunks (thinking phase)
                        if (!$done && $content === '') continue;

                        echo 'data: ' . json_encode([
                            'delta' => $content,
                            'done'  => $done,
                        ]) . "\n\n";

                        if (ob_get_level()) ob_flush();
                        flush();
                    }
                    return strlen($data);
                },
            ]);

            curl_exec($ch);

            if (curl_errno($ch)) {
                Log::error('LLM stream curl error: ' . curl_error($ch));
                echo 'data: ' . json_encode([
                    'error' => 'LLM provider stream failed',
                    'done'  => true,
                ]) . "\n\n";
                if (ob_get_level()) ob_flush();
                flush();
            }

            curl_close($ch);
        }, 200, [
            'Content-Type'      => 'text/event-stream',
            'Cache-Control'     => 'no-cache',
            'Connection'        => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * GET /api/mods/llm/ollama/health
     *
     * Check Ollama connectivity and return available models.
     */
    public function ollamaHealth()
    {
        $cacheKey = 'mod:llm:ollama:health';

        $result = Cache::remember($cacheKey, 30, function () {
            $url = $this->ollamaUrl('/api/tags');

            try {
                $response = Http::timeout(5)->get($url);
                if ($response->successful()) {
                    $models = collect($response->json('models', []))
                        ->pluck('name')
                        ->toArray();
                    return ['status' => 'online', 'models' => $models];
                }
                return ['status' => 'offline', 'models' => []];
            } catch (\Exception $e) {
                Log::warning('Ollama health check failed: ' . $e->getMessage());
                return ['status' => 'offline', 'models' => []];
            }
        });

        $statusCode = $result['status'] === 'online' ? 200 : 503;
        return response()->json($result, $statusCode);
    }

    // ── Private helpers ──────────────────────────────────────────

    private function ollamaUrl(string $path): string
    {
        $host = config('services.ollama.host');
        $port = config('services.ollama.port');

        return "http://{$host}:{$port}{$path}";
    }

    private function chatViaOllama(string $model, array $messages, float $temperature): string
    {
        $url = $this->ollamaUrl('/api/chat');

        $response = Http::timeout(120)->post($url, [
            'model'      => $model,
            'messages'   => $messages,
            'stream'     => false,
            'think'      => false,
            'keep_alive' => '5m',
            'options'    => [
                'temperature'  => $temperature,
                'num_ctx'      => 2048,
                'num_predict'  => 2048,
            ],
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Ollama request failed: ' . $response->body());
        }

        return $response->json('message.content', '');
    }

    private function chatViaOpenAI(string $model, array $messages, float $temperature, string $apiKey): string
    {
        if (!$apiKey) {
            throw new \RuntimeException('OpenAI API key is required');
        }

        $response = Http::timeout(120)
            ->withHeaders([
                'Authorization' => "Bearer {$apiKey}",
            ])
            ->post('https://api.openai.com/v1/chat/completions', [
                'model' => $model,
                'messages' => $messages,
                'temperature' => $temperature,
            ]);

        if (!$response->successful()) {
            throw new \RuntimeException('OpenAI request failed: ' . $response->body());
        }

        return $response->json('choices.0.message.content', '');
    }

    private function chatViaAnthropic(string $model, array $messages, float $temperature, string $apiKey): string
    {
        if (!$apiKey) {
            throw new \RuntimeException('Anthropic API key is required');
        }

        // Extract system message from messages array
        $system = '';
        $filteredMessages = [];
        foreach ($messages as $msg) {
            if ($msg['role'] === 'system') {
                $system = $msg['content'];
            } else {
                $filteredMessages[] = $msg;
            }
        }

        $payload = [
            'model' => $model,
            'max_tokens' => 4096,
            'messages' => $filteredMessages,
            'temperature' => $temperature,
        ];

        if ($system) {
            $payload['system'] = $system;
        }

        $response = Http::timeout(120)
            ->withHeaders([
                'x-api-key' => $apiKey,
                'anthropic-version' => '2023-06-01',
                'content-type' => 'application/json',
            ])
            ->post('https://api.anthropic.com/v1/messages', $payload);

        if (!$response->successful()) {
            throw new \RuntimeException('Anthropic request failed: ' . $response->body());
        }

        return $response->json('content.0.text', '');
    }
}
