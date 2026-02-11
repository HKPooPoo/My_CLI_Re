<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class TranslationController extends Controller
{
    private const ALLOWED_TARGETS = ['zh-TW', 'zh-CN', 'en', 'ja'];

    // Cache TTL: 24 hours (same text + same target = same result)
    private const CACHE_TTL_SECONDS = 86400;

    public function translate(Request $request)
    {
        $validated = $request->validate([
            'text' => 'required|string|max:5000',
            'target' => 'required|string|in:' . implode(',', self::ALLOWED_TARGETS),
        ]);

        $apiKey = config('services.google.api_key');

        if (!$apiKey) {
            return response()->json([
                'error' => ['message' => 'API Key not configured on server']
            ], 500);
        }

        // === Redis Cache: Skip Google API if already translated ===
        $cacheKey = 'translate:' . md5($validated['text'] . ':' . $validated['target']);

        $cached = Cache::get($cacheKey);
        if ($cached) {
            return response()->json($cached);
        }

        // === Call Google Translation API ===
        $url = "https://translation.googleapis.com/language/translate/v2?key={$apiKey}";

        try {
            $response = Http::timeout(10)
                ->connectTimeout(5)
                ->post($url, [
                    'q' => $validated['text'],
                    'target' => $validated['target'],
                    'format' => 'text',
                ]);

            $json = $response->json();

            // Cache successful responses only
            if ($response->successful() && !isset($json['error'])) {
                Cache::put($cacheKey, $json, self::CACHE_TTL_SECONDS);
            }

            return response()->json($json, $response->status());
        } catch (\Exception $e) {
            Log::error('Translation API Error: ' . $e->getMessage());
            return response()->json([
                'error' => ['message' => 'Translation service unavailable']
            ], 502);
        }
    }
}
