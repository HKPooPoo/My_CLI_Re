<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\DB;

class StatusController extends Controller
{
    public function check()
    {
        try {
            DB::connection()->getPdo();
            return response()->json(['status' => 'ONLINE']);
        } catch (\Exception $e) {
            return response()->json(['status' => 'OFFLINE'], 503);
        }
    }
}
