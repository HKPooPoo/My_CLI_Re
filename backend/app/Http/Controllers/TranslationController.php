<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TranslationController extends Controller
{
    private const ALLOWED_TARGETS = ['zh-TW', 'zh-CN', 'en', 'ja'];

    public function translate(Request $request)
    {
        try {
            $validated = $request->validate([
                'text' => 'required|string|max:5000',
                'target' => 'required|string|in:' . implode(',', self::ALLOWED_TARGETS),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::error('Validation Fail:', $e->errors());
            throw $e;
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
}
