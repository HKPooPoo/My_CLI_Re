<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SpeechController extends Controller
{
    // Max ~10MB base64 payload (roughly ~7.5MB audio)
    private const MAX_AUDIO_SIZE = 10 * 1024 * 1024;

    public function recognize(Request $request)
    {
        $validated = $request->validate([
            'audio' => 'required|string',
        ]);

        // Enforce payload size limit
        if (strlen($validated['audio']) > self::MAX_AUDIO_SIZE) {
            return response()->json([
                'error' => ['message' => 'Audio payload too large']
            ], 413);
        }

        $apiKey = config('services.google.api_key');

        if (!$apiKey) {
            return response()->json([
                'error' => ['message' => 'API Key not configured on server']
            ], 500);
        }

        // Try V2 (Chirp 2) first, with strict timeout
        $projectId = config('services.google.project_id', 'my-cli-re');
        $v2Result = $this->tryV2($apiKey, $projectId, $validated['audio']);

        if ($v2Result !== null) {
            return $v2Result;
        }

        // Fallback to V1
        return $this->tryV1($apiKey, $validated['audio']);
    }

    private function tryV2(string $apiKey, string $projectId, string $base64Audio)
    {
        $url = "https://speech.googleapis.com/v2/projects/{$projectId}/locations/global/recognizers/_:recognize?key={$apiKey}";

        try {
            $response = Http::timeout(15)
                ->connectTimeout(5)
                ->post($url, [
                    'config' => [
                        'autoDecodingConfig' => new \stdClass(),
                        'languageCodes' => ['cmn-Hant-TW'],
                        'model' => 'chirp_2',
                        'features' => [
                            'enableAutomaticPunctuation' => true,
                        ],
                    ],
                    'content' => $base64Audio,
                ]);

            if ($response->successful() && !isset($response->json()['error'])) {
                return response()->json($response->json());
            }
        } catch (\Exception $e) {
            Log::warning('Speech V2 failed, falling back to V1: ' . $e->getMessage());
        }

        return null;
    }

    private function tryV1(string $apiKey, string $base64Audio)
    {
        $url = "https://speech.googleapis.com/v1/speech:recognize?key={$apiKey}";

        try {
            $response = Http::timeout(15)
                ->connectTimeout(5)
                ->post($url, [
                    'config' => [
                        'encoding' => 'WEBM_OPUS',
                        'sampleRateHertz' => 48000,
                        'languageCode' => 'cmn-Hant-TW',
                        'enableAutomaticPunctuation' => true,
                    ],
                    'audio' => [
                        'content' => $base64Audio,
                    ],
                ]);

            return response()->json($response->json(), $response->status());
        } catch (\Exception $e) {
            Log::error('Speech V1 Error: ' . $e->getMessage());
            return response()->json([
                'error' => ['message' => 'Speech service unavailable']
            ], 502);
        }
    }
}
