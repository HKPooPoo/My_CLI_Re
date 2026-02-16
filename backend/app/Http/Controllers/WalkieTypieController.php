<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class WalkieTypieController extends Controller
{
    /**
     * Get list of connections
     */
    public function index()
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['message' => 'Unauthorized'], 401);

        $connections = DB::table('walkie_typie_connections')
            ->where('user_uid', $user->uid)
            ->orderBy('last_signal', 'desc')
            ->get();

        return response()->json(['connections' => $connections]);
    }

    /**
     * Add a partner using their UID
     */
    public function store(Request $request)
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['message' => 'Unauthorized'], 401);

        $partnerUid = $request->input('uid');
        if (!$partnerUid || $partnerUid === $user->uid) {
            return response()->json(['message' => 'INVALID UID'], 400);
        }

        // Check if partner exists
        $partner = User::where('uid', $partnerUid)->first();
        if (!$partner) {
            return response()->json(['message' => 'USER NOT FOUND'], 404);
        }

        // Check if already connected
        $existing = DB::table('walkie_typie_connections')
            ->where('user_uid', $user->uid)
            ->where('partner_uid', $partnerUid)
            ->first();

        if ($existing) {
            return response()->json(['message' => 'ALREADY CONNECTED', 'connection' => $existing]);
        }

        return DB::transaction(function () use ($user, $partnerUid) {
            $now = (int) (microtime(true) * 1000);

            // Reciprocal check: did B already add A?
            $reciprocal = DB::table('walkie_typie_connections')
                ->where('user_uid', $partnerUid)
                ->where('partner_uid', $user->uid)
                ->first();

            if ($reciprocal) {
                // Reuse branch IDs to maintain "Twin" relationship
                $myBranchId = $reciprocal->partner_branch_id;
                $partnerBranchId = $reciprocal->my_branch_id;
            } else {
                // Generate new unique branch IDs for this pair
                // We use timestamp as base and add small offset
                $myBranchId = $now;
                $partnerBranchId = $now + 1;
            }

            $id = DB::table('walkie_typie_connections')->insertGetId([
                'user_uid' => $user->uid,
                'partner_uid' => $partnerUid,
                'my_branch_id' => $myBranchId,
                'partner_branch_id' => $partnerBranchId,
                'last_signal' => $now,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return response()->json([
                'message' => 'CONNECTED',
                'connection' => DB::table('walkie_typie_connections')->where('id', $id)->first()
            ]);
        });
    }

    /**
     * Update tag for a partner
     */
    public function updateTag(Request $request, $partnerUid)
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['message' => 'Unauthorized'], 401);

        DB::table('walkie_typie_connections')
            ->where('user_uid', $user->uid)
            ->where('partner_uid', $partnerUid)
            ->update([
                'partner_tag' => $request->input('tag'),
                'updated_at' => now()
            ]);

        return response()->json(['message' => 'TAG UPDATED']);
    }

    /**
     * Get Reverb Config for Frontend
     */
    public function config()
    {
        $app = config('reverb.apps.apps.0');
        return response()->json([
            'key' => $app['key'] ?? null,
            'host' => $app['options']['host'] ?? 'localhost',
            'port' => $app['options']['port'] ?? 80,
            'scheme' => $app['options']['scheme'] ?? 'http',
        ]);
    }
}
