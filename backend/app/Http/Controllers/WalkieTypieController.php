<?php

namespace App\Http\Controllers;

use App\Events\WalkieTypieConnectionUpdated;
use App\Events\WalkieTypieContentUpdated;
use App\Models\User;
use App\Services\WalkieTypieBoardService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class WalkieTypieController extends Controller
{
    protected $boardService;

    public function __construct(WalkieTypieBoardService $boardService)
    {
        $this->boardService = $boardService;
    }

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
     * Send a signal (content update) to a partner
     */
    public function signal(Request $request)
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['message' => 'Unauthorized'], 401);

        $request->validate([
            'partner_uid' => 'required|string',
            'text' => 'nullable|string',
            'branch_id' => 'required'
        ]);

        $partnerUid = $request->input('partner_uid');
        $text = $request->input('text') ?? '';
        $branchId = $request->input('branch_id'); // This is the partner's branch ID that should be updated

        // Verify connection exists (security check)
        $exists = DB::table('walkie_typie_connections')
            ->where('user_uid', $user->uid)
            ->where('partner_uid', $partnerUid)
            ->exists();

        if (!$exists) {
            return response()->json(['message' => 'NOT CONNECTED'], 403);
        }

        // Update last signal time for sorting
        $now = (int) (microtime(true) * 1000);

        DB::table('walkie_typie_connections')
            ->where('user_uid', $user->uid)
            ->where('partner_uid', $partnerUid)
            ->update(['last_signal' => $now, 'updated_at' => now()]);

        // Also update partner's view of me
        DB::table('walkie_typie_connections')
            ->where('user_uid', $partnerUid)
            ->where('partner_uid', $user->uid)
            ->update(['last_signal' => $now, 'updated_at' => now()]);

        // Broadcast content
        broadcast(new WalkieTypieContentUpdated($partnerUid, [
            'text' => $text,
            'branch_id' => $branchId, // Partner will use this to identify WHICH board to update
            'sender_uid' => $user->uid,
            'timestamp' => $now
        ]));

        return response()->json(['message' => 'SIGNAL SENT']);
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

            // Deterministic Branch IDs (String based)
            // Format: wt_{Sender}_{Receiver}
            // User writes to: wt_{User}_{Partner}
            // User reads from: wt_{Partner}_{User}
            $myBranchId = "wt_{$user->uid}_{$partnerUid}";
            $partnerBranchId = "wt_{$partnerUid}_{$user->uid}";

            // Update or Create connection for User -> Partner
            DB::table('walkie_typie_connections')->upsert([
                [
                    'user_uid' => $user->uid,
                    'partner_uid' => $partnerUid,
                    'my_branch_id' => $myBranchId,
                    'partner_branch_id' => $partnerBranchId,
                    'last_signal' => $now,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            ], ['user_uid', 'partner_uid'], ['last_signal', 'updated_at']);

            // Update or Create connection for Partner -> User
            // Note: For the partner, "My Branch" is what THEY write to (Partner->User)
            // "Partner Branch" is what THEY read from (User->Partner)
            DB::table('walkie_typie_connections')->upsert([
                [
                    'user_uid' => $partnerUid,
                    'partner_uid' => $user->uid,
                    'my_branch_id' => $partnerBranchId,
                    'partner_branch_id' => $myBranchId,
                    'last_signal' => $now,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            ], ['user_uid', 'partner_uid'], ['last_signal', 'updated_at']);

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
            $c1Array = (array) $c1;
            $c2Array = (array) $c2;

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

    // --- Board Operations (獨立於 Blackboard) ---

    /**
     * Commit board records
     */
    public function commitBoard(Request $request)
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['message' => 'Unauthorized'], 401);

        $request->validate([
            'branchId' => 'required',
            'branchName' => 'required',
            'records' => 'required|array'
        ]);

        $this->boardService->commit(
            $user,
            $request->input('branchId'),
            $request->input('branchName'),
            $request->input('records')
        );

        return response()->json(['message' => 'Commit Successful']);
    }

    /**
     * Fetch board records for a branch
     */
    public function fetchBoardRecords($branchId)
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['message' => 'Unauthorized'], 401);

        $records = $this->boardService->fetchBoardRecords($user, $branchId);
        return response()->json(['records' => $records]);
    }
}
