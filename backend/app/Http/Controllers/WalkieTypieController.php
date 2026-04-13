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
            ->join('users as partner', 'walkie_typie_connections.partner_id', '=', 'partner.id')
            ->where('walkie_typie_connections.user_id', $user->id)
            ->orderBy('walkie_typie_connections.last_signal', 'desc')
            ->select(
                'walkie_typie_connections.*',
                'partner.uid as partner_uid'
            )
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
        $branchId = $request->input('branch_id');

        // Look up partner's numeric ID from UID
        $partnerId = DB::table('users')->where('uid', $partnerUid)->value('id');
        if (!$partnerId) {
            return response()->json(['message' => 'PARTNER NOT FOUND'], 404);
        }

        // Security: verify connection exists
        $exists = DB::table('walkie_typie_connections')
            ->where('user_id', $user->id)
            ->where('partner_id', $partnerId)
            ->exists();

        if (!$exists) {
            return response()->json(['message' => 'NOT CONNECTED'], 403);
        }

        broadcast(new WalkieTypieContentUpdated($partnerUid, [
            'text' => $text,
            'branch_id' => $branchId,
            'sender_uid' => $user->uid,
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

        $partner = User::where('uid', $partnerUid)->first();
        if (!$partner) {
            return response()->json(['message' => 'USER NOT FOUND'], 404);
        }

        return DB::transaction(function () use ($user, $partner) {
            $now = (int) (microtime(true) * 1000);

            // Deterministic Branch IDs using numeric IDs
            $myBranchId = "wt_{$user->id}_{$partner->id}";
            $partnerBranchId = "wt_{$partner->id}_{$user->id}";

            // Update or Create connection for User -> Partner
            DB::table('walkie_typie_connections')->upsert([
                [
                    'user_id' => $user->id,
                    'partner_id' => $partner->id,
                    'my_branch_id' => $myBranchId,
                    'partner_branch_id' => $partnerBranchId,
                    'last_signal' => $now,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            ], ['user_id', 'partner_id'], ['last_signal', 'updated_at']);

            // Update or Create connection for Partner -> User
            DB::table('walkie_typie_connections')->upsert([
                [
                    'user_id' => $partner->id,
                    'partner_id' => $user->id,
                    'my_branch_id' => $partnerBranchId,
                    'partner_branch_id' => $myBranchId,
                    'last_signal' => $now,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            ], ['user_id', 'partner_id'], ['last_signal', 'updated_at']);

            // Fetch fresh records with partner_uid joined
            $c1 = DB::table('walkie_typie_connections')
                ->join('users as partner', 'walkie_typie_connections.partner_id', '=', 'partner.id')
                ->where('walkie_typie_connections.user_id', $user->id)
                ->where('walkie_typie_connections.partner_id', $partner->id)
                ->select('walkie_typie_connections.*', 'partner.uid as partner_uid')
                ->first();

            $c2 = DB::table('walkie_typie_connections')
                ->join('users as partner', 'walkie_typie_connections.partner_id', '=', 'partner.id')
                ->where('walkie_typie_connections.user_id', $partner->id)
                ->where('walkie_typie_connections.partner_id', $user->id)
                ->select('walkie_typie_connections.*', 'partner.uid as partner_uid')
                ->first();

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

        $partnerId = DB::table('users')->where('uid', $partnerUid)->value('id');
        if (!$partnerId) {
            return response()->json(['message' => 'PARTNER NOT FOUND'], 404);
        }

        $affected = DB::table('walkie_typie_connections')
            ->where('user_id', $user->id)
            ->where('partner_id', $partnerId)
            ->update([
                'partner_tag' => $request->input('tag'),
                'updated_at' => now()
            ]);

        if ($affected === 0) {
            return response()->json(['message' => 'CONNECTION NOT FOUND'], 404);
        }

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

    /**
     * Delete a connection and all associated data
     */
    public function destroy($partnerUid)
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['message' => 'Unauthorized'], 401);

        $partnerId = DB::table('users')->where('uid', $partnerUid)->value('id');
        if (!$partnerId) {
            return response()->json(['message' => 'PARTNER NOT FOUND'], 404);
        }

        $conn = DB::table('walkie_typie_connections')
            ->where('user_id', $user->id)
            ->where('partner_id', $partnerId)
            ->first();

        if (!$conn) {
            return response()->json(['message' => 'CONNECTION NOT FOUND'], 404);
        }

        $myBranchId = $conn->my_branch_id;
        $partnerBranchId = $conn->partner_branch_id;

        DB::transaction(function () use ($user, $partnerId, $myBranchId, $partnerBranchId) {
            DB::table('walkie_typie_connections')
                ->where('user_id', $user->id)
                ->where('partner_id', $partnerId)
                ->delete();

            DB::table('walkie_typie_connections')
                ->where('user_id', $partnerId)
                ->where('partner_id', $user->id)
                ->delete();

            $this->boardService->deleteBoards($user->id, $myBranchId);
            $this->boardService->deleteBoards($partnerId, $partnerBranchId);
        });

        broadcast(new WalkieTypieConnectionUpdated($partnerUid, [
            'deleted' => true,
            'partner_uid' => $user->uid
        ]));

        return response()->json(['message' => 'CONNECTION DELETED']);
    }

    // --- Board Operations ---

    /**
     * Commit board records
     */
    public function commitBoard(Request $request)
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['message' => 'Unauthorized'], 401);

        $request->validate([
            'branch_id'           => 'required',
            'branch_name'         => 'required',
            'records'             => 'required|array|max:1000',
            'records.*.text'      => 'nullable|string|max:65535',
            'records.*.timestamp' => 'required|integer',
            'records.*.file_hash' => 'nullable|string|max:65535',
        ]);

        $this->boardService->commit(
            $user,
            $request->input('branch_id'),
            $request->input('branch_name'),
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
