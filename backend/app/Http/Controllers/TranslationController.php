<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TranslationController extends Controller
{
    private const ALLOWED_TARGETS = ['zh-TW', 'zh-CN', 'en', 'ja'];

    /**
     * Language code mapping for LibreTranslate.
     * LibreTranslate uses simplified codes (e.g., 'zh' instead of 'zh-TW').
     */
    private const LT_LANG_MAP = [
        'zh-TW' => 'zh',
        'zh-CN' => 'zh',
        'en' => 'en',
        'ja' => 'ja',
    ];

    public function translate(Request $request)
    {
        try {
            $validated = $request->validate([
                'text' => 'required|string|max:5000',
                'target' => 'required|string|in:' . implode(',', self::ALLOWED_TARGETS),
                'provider' => 'sometimes|string|in:google,libretranslate',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::error('Validation Fail:', $e->errors());
            throw $e;
        }

        $provider = $validated['provider'] ?? 'google';

        if ($provider === 'libretranslate') {
            return $this->translateViaLibreTranslate($validated);
        }

        return $this->translateViaGoogle($validated);
    }

    /**
     * Translate via Google Cloud Translation API.
     */
    private function translateViaGoogle(array $validated)
    {
        $apiKey = config('services.google.api_key');

        if (!$apiKey) {
            return response()->json([
                'error' => ['message' => 'API Key not configured on server']
            ], 500);
        }

        $url = "https://translation.googleapis.com/language/translate/v2?key={$apiKey}";

        try {
            $response = Http::post($url, [
                'q' => $validated['text'],
                'target' => $validated['target'],
                'format' => 'text',
            ]);

            return response()->json($response->json(), $response->status());
        } catch (\Exception $e) {
            Log::error('Google Translation API Error: ' . $e->getMessage());
            return response()->json([
                'error' => ['message' => 'Translation service unavailable']
            ], 502);
        }
    }

    /**
     * Translate via LibreTranslate (local Docker service).
     * Falls back to Google if LibreTranslate fails.
     */
    private function translateViaLibreTranslate(array $validated)
    {
        $host = config('services.libretranslate.host');
        $port = config('services.libretranslate.port');
        $url = "http://{$host}:{$port}/translate";

        $targetLang = self::LT_LANG_MAP[$validated['target']] ?? $validated['target'];

        try {
            $response = Http::timeout(15)->post($url, [
                'q' => $validated['text'],
                'source' => 'auto',
                'target' => $targetLang,
                'format' => 'text',
            ]);

            if ($response->successful()) {
                $translatedText = $response->json('translatedText');

                // Return in same format as Google for frontend compatibility
                return response()->json([
                    'data' => [
                        'translations' => [
                            ['translatedText' => $translatedText]
                        ]
                    ],
                    'provider' => 'libretranslate'
                ]);
            }

            Log::warning('LibreTranslate returned non-success, falling back to Google', [
                'status' => $response->status(),
            ]);

            // Fallback to Google
            return $this->translateViaGoogle($validated);

        } catch (\Exception $e) {
            Log::warning('LibreTranslate failed, falling back to Google: ' . $e->getMessage());

            // Fallback to Google
            return $this->translateViaGoogle($validated);
        }
    }
}
