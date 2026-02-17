<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use App\Models\User;
use App\Events\WalkieTypieSignal;

class WalkieTypieBoardService
{
    /**
     * Commit board records to walkie_typie_boards table.
     * Unlike BlackboardService::commit(), this does NOT delete old records.
     * It performs upsert only, preserving history.
     */
    public function commit(User $user, string $branchId, string $branchName, array $records)
    {
        return DB::transaction(function () use ($user, $branchId, $branchName, $records) {
            $insertData = [];
            foreach ($records as $record) {
                $text = $record['text'] ?? '';
                if (trim($text) === "" && empty($record['bin'])) {
                    continue;
                }

                $insertData[] = [
                    'owner' => $user->uid,
                    'branch_id' => $branchId,
                    'branch_name' => $branchName,
                    'timestamp' => $record['timestamp'],
                    'text' => $text,
                    'bin' => $record['bin'] ?? null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            if (!empty($insertData)) {
                DB::table('walkie_typie_boards')->upsert(
                    $insertData,
                    ['owner', 'branch_id', 'timestamp'],
                    ['branch_name', 'text', 'bin', 'updated_at']
                );
            }

            // Broadcast to partner if connection exists
            $this->broadcastUpdate($user, $branchId);
        });
    }

    /**
     * Broadcast update signal to the connected partner.
     */
    protected function broadcastUpdate(User $user, string $branchId)
    {
        $connection = DB::table('walkie_typie_connections')
            ->where('user_uid', $user->uid)
            ->where('my_branch_id', $branchId)
            ->first();

        if ($connection) {
            $nowMs = (int) (microtime(true) * 1000);
            DB::table('walkie_typie_connections')
                ->where('user_uid', $user->uid)
                ->where('partner_uid', $connection->partner_uid)
                ->update(['last_signal' => $nowMs, 'updated_at' => now()]);

            DB::table('walkie_typie_connections')
                ->where('user_uid', $connection->partner_uid)
                ->where('partner_uid', $user->uid)
                ->update(['last_signal' => $nowMs, 'updated_at' => now()]);

            broadcast(new WalkieTypieSignal($user->uid, $connection->partner_uid, $branchId));
        }
    }

    /**
     * Fetch board records for a given branch.
     * Access check: user must own the branch or have a WT connection to it.
     */
    public function fetchBoardRecords($user, $branchId)
    {
        // 1. Check if user owns the branch
        $isOwner = DB::table('walkie_typie_boards')
            ->where('branch_id', $branchId)
            ->where('owner', $user->uid)
            ->exists();

        // 2. Check if user has access via Walkie-Typie connection
        $hasConnection = false;
        if (!$isOwner) {
            $hasConnection = DB::table('walkie_typie_connections')
                ->where('user_uid', $user->uid)
                ->where(function ($query) use ($branchId) {
                    $query->where('my_branch_id', $branchId)
                        ->orWhere('partner_branch_id', $branchId);
                })
                ->exists();
        }

        if (!$isOwner && !$hasConnection) {
            return [];
        }

        return DB::table('walkie_typie_boards')
            ->where('branch_id', $branchId)
            ->orderBy('timestamp', 'asc')
            ->get();
    }

    /**
     * Delete all board records for a connection (used when CUT).
     */
    public function deleteBoards(string $ownerUid, string $branchId)
    {
        return DB::table('walkie_typie_boards')
            ->where('owner', $ownerUid)
            ->where('branch_id', $branchId)
            ->delete();
    }
}
