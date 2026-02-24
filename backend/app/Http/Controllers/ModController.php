<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class ModController extends Controller
{
    /**
     * GET /api/mods/offline-translate/health
     *
     * Check if LibreTranslate is reachable by querying its /languages endpoint.
     * Result is cached for 30 seconds in Redis.
     */
    public function offlineTranslateHealth()
    {
        $cacheKey = 'mod:offline-translate:health';

        $status = Cache::remember($cacheKey, 30, function () {
            $host = config('services.libretranslate.host');
            $port = config('services.libretranslate.port');
            $url = "http://{$host}:{$port}/languages";

            try {
                $response = Http::timeout(5)->get($url);
                if ($response->successful()) {
                    return 'online';
                }
                return 'offline';
            } catch (\Exception $e) {
                Log::warning('LibreTranslate health check failed: ' . $e->getMessage());
                return 'offline';
            }
        });

        if ($status === 'online') {
            return response()->json(['status' => 'online']);
        }

        return response()->json(['status' => 'offline'], 503);
    }
}
