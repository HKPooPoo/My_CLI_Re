<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Models\User;
use App\Events\WalkieTypieSignal;
use App\Services\FileService;

class WalkieTypieBoardService
{
    protected FileService $fileService;

    public function __construct(FileService $fileService)
    {
        $this->fileService = $fileService;
    }

    /**
     * Commit board records to walkie_typie_boards table.
     */
    public function commit(User $user, string $branchId, string $branchName, array $records)
    {
        return DB::transaction(function () use ($user, $branchId, $branchName, $records) {
            $incomingTimestamps = array_column($records, 'timestamp');

            DB::table('walkie_typie_boards')
                ->where('user_id', $user->id)
                ->where('branch_id', $branchId)
                ->whereNotIn('timestamp', $incomingTimestamps)
                ->delete();

            $insertData = [];
            $fileHashes = [];
            foreach ($records as $record) {
                $text = $record['text'] ?? '';
                if (trim($text) === "" && empty($record['file_hash'])) {
                    continue;
                }

                [$fileHash, $hashes] = FileService::normalizeFileHash($record['file_hash'] ?? null);
                $fileHashes = array_merge($fileHashes, $hashes);

                $insertData[] = [
                    'user_id' => $user->id,
                    'branch_id' => $branchId,
                    'branch_name' => $branchName,
                    'timestamp' => $record['timestamp'],
                    'text' => $text,
                    'file_hash' => $fileHash,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            if (!empty($insertData)) {
                DB::table('walkie_typie_boards')->upsert(
                    $insertData,
                    ['user_id', 'branch_id', 'timestamp'],
                    ['branch_name', 'text', 'file_hash', 'updated_at']
                );
            }

            $this->fileService->markCommittedBatch($fileHashes);

            Cache::forget("wt:boards:{$branchId}");

            $this->broadcastUpdate($user, $branchId);
        });
    }

    /**
     * Broadcast update signal to the connected partner.
     */
    protected function broadcastUpdate(User $user, string $branchId)
    {
        $connection = DB::table('walkie_typie_connections')
            ->where('user_id', $user->id)
            ->where('my_branch_id', $branchId)
            ->first();

        if ($connection) {
            // Look up partner's uid for the event
            $partnerUid = DB::table('users')->where('id', $connection->partner_id)->value('uid');

            $nowMs = (int) (microtime(true) * 1000);
            DB::table('walkie_typie_connections')
                ->where('user_id', $user->id)
                ->where('partner_id', $connection->partner_id)
                ->update(['last_signal' => $nowMs, 'updated_at' => now()]);

            DB::table('walkie_typie_connections')
                ->where('user_id', $connection->partner_id)
                ->where('partner_id', $user->id)
                ->update(['last_signal' => $nowMs, 'updated_at' => now()]);

            broadcast(new WalkieTypieSignal($user->uid, $partnerUid, $branchId));
        }
    }

    /**
     * Fetch board records for a given branch.
     */
    public function fetchBoardRecords($user, $branchId)
    {
        $isOwner = DB::table('walkie_typie_boards')
            ->where('branch_id', $branchId)
            ->where('user_id', $user->id)
            ->exists();

        $hasConnection = false;
        if (!$isOwner) {
            $hasConnection = DB::table('walkie_typie_connections')
                ->where('user_id', $user->id)
                ->where(function ($query) use ($branchId) {
                    $query->where('my_branch_id', $branchId)
                        ->orWhere('partner_branch_id', $branchId);
                })
                ->exists();
        }

        if (!$isOwner && !$hasConnection) {
            return [];
        }

        return Cache::remember("wt:boards:{$branchId}", 30, fn() =>
            DB::table('walkie_typie_boards')
                ->where('branch_id', $branchId)
                ->orderBy('timestamp', 'asc')
                ->select('walkie_typie_boards.*')
                ->get()
        );
    }

    /**
     * Delete all board records for a connection (used when CUT).
     */
    public function deleteBoards(int $userId, string $branchId)
    {
        return DB::table('walkie_typie_boards')
            ->where('user_id', $userId)
            ->where('branch_id', $branchId)
            ->delete();
    }
}
