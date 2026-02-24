<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class StatusController extends Controller
{
    public function check()
    {
        $cached = Cache::get('status:online');
        if ($cached !== null) {
            $code = $cached === 'ONLINE' ? 200 : 503;
            return response()->json(['status' => $cached], $code);
        }

        try {
            DB::connection()->getPdo();
            Cache::put('status:online', 'ONLINE', 10);
            return response()->json(['status' => 'ONLINE']);
        } catch (\Exception $e) {
            return response()->json(['status' => 'OFFLINE'], 503);
        }
    }
}
