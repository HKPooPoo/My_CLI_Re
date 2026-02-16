<?php

namespace App\Http\Controllers;

use App\Events\WalkieTypieConnectionUpdated;
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

        return DB::transaction(function () use ($user, $partner, $partnerUid) {
            $now = (int) (microtime(true) * 1000);

            // Check existing connection (either direction) to reuse branch IDs
            $existing = DB::table('walkie_typie_connections')
                ->where('user_uid', $user->uid)
                ->where('partner_uid', $partnerUid)
                ->first();

            $reciprocal = DB::table('walkie_typie_connections')
                ->where('user_uid', $partnerUid)
                ->where('partner_uid', $user->uid)
                ->first();

            if ($existing) {
                $myBranchId = $existing->my_branch_id;
                $partnerBranchId = $existing->partner_branch_id;
            } elseif ($reciprocal) {
                $myBranchId = $reciprocal->partner_branch_id;
                $partnerBranchId = $reciprocal->my_branch_id;
            } else {
                $myBranchId = $now;
                $partnerBranchId = $now + 1;
            }

            // Refined Logic for User -> Partner
            $conn1 = DB::table('walkie_typie_connections')
                ->where('user_uid', $user->uid)
                ->where('partner_uid', $partnerUid)
                ->first();
            
            if ($conn1) {
                DB::table('walkie_typie_connections')
                    ->where('id', $conn1->id)
                    ->update(['last_signal' => $now, 'updated_at' => now()]);
            } else {
                DB::table('walkie_typie_connections')->insert([
                    'user_uid' => $user->uid,
                    'partner_uid' => $partnerUid,
                    'my_branch_id' => $myBranchId,
                    'partner_branch_id' => $partnerBranchId,
                    'last_signal' => $now,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            // Refined Logic for Partner -> User
            $conn2 = DB::table('walkie_typie_connections')
                ->where('user_uid', $partnerUid)
                ->where('partner_uid', $user->uid)
                ->first();

            if ($conn2) {
                DB::table('walkie_typie_connections')
                    ->where('id', $conn2->id)
                    ->update(['last_signal' => $now, 'updated_at' => now()]);
            } else {
                DB::table('walkie_typie_connections')->insert([
                    'user_uid' => $partnerUid,
                    'partner_uid' => $user->uid,
                    'my_branch_id' => $partnerBranchId, // Swapped
                    'partner_branch_id' => $myBranchId, // Swapped
                    'last_signal' => $now,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            // Fetch fresh records to broadcast
            $c1 = DB::table('walkie_typie_connections')
                ->where('user_uid', $user->uid)
                ->where('partner_uid', $partnerUid)
                ->first();
                
            $c2 = DB::table('walkie_typie_connections')
                ->where('user_uid', $partnerUid)
                ->where('partner_uid', $user->uid)
                ->first();

            // Convert object to array for event
            $c1Array = (array)$c1;
            $c2Array = (array)$c2;

            broadcast(new WalkieTypieConnectionUpdated($user->uid, $c1Array));
            broadcast(new WalkieTypieConnectionUpdated($partner->uid, $c2Array));

            return response()->json([
                'message' => 'CONNECTED',
                'connection' => $c1
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
