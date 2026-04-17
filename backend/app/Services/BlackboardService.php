<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Models\User;
use App\Events\BlackboardUpdated;

class BlackboardService
{
    protected FileService $fileService;

    public function __construct(FileService $fileService)
    {
        $this->fileService = $fileService;
    }

    public function commit(User $user, string $branchId, string $branchName, array $records, ?string $deviceId = null)
    {
        DB::transaction(function () use ($user, $branchId, $branchName, $records) {
            $incomingTimestamps = array_column($records, 'timestamp');

            DB::table('blackboards')
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

            // Deduplicate by timestamp — client may send records with the same
            // branch_id+timestamp due to multiple owner variants in IndexedDB.
            // Keep the last occurrence (most recently processed).
            $deduped = [];
            foreach ($insertData as $row) {
                $deduped[$row['timestamp']] = $row;
            }
            $insertData = array_values($deduped);

            if (!empty($insertData)) {
                DB::table('blackboards')->upsert(
                    $insertData,
                    ['user_id', 'branch_id', 'timestamp'],
                    ['branch_name', 'text', 'file_hash', 'updated_at']
                );
            }

            $this->fileService->markCommittedBatch($fileHashes);

            Cache::forget("user:{$user->id}:branches");
            Cache::forget("bb:branch:{$user->id}:{$branchId}:details");
        });

        if ($deviceId) {
            broadcast(new BlackboardUpdated($user->uid, $branchId, $deviceId));
        }
    }


    public function fetchBranches(User $user)
    {
        return Cache::remember("user:{$user->id}:branches", config('timing.backend.cacheTTL.bbBranchList'), function () use ($user) {
            return DB::table('blackboards')
                ->join('users', 'blackboards.user_id', '=', 'users.id')
                ->where('blackboards.user_id', $user->id)
                ->select('blackboards.branch_id', 'blackboards.branch_name', 'users.uid', DB::raw('MAX(blackboards.timestamp) as last_update'))
                ->groupBy('blackboards.branch_id', 'blackboards.branch_name', 'users.uid')
                ->orderBy('last_update', 'desc')
                ->get();
        });
    }

    public function fetchBranchDetails($user, $branchId)
    {
        $isOwner = DB::table('blackboards')
            ->where('branch_id', $branchId)
            ->where('user_id', $user->id)
            ->exists();

        if (!$isOwner) {
            return [];
        }

        return Cache::remember("bb:branch:{$user->id}:{$branchId}:details", config('timing.backend.cacheTTL.bbBranchDetails'), function () use ($user, $branchId) {
            $records = DB::table('blackboards')
                ->join('users', 'blackboards.user_id', '=', 'users.id')
                ->where('blackboards.branch_id', $branchId)
                ->where('blackboards.user_id', $user->id)
                ->orderBy('blackboards.timestamp', 'asc')
                ->select('blackboards.*', 'users.uid')
                ->get();

            // Hide file_hash entries whose blob is not currently available, so the
            // user does not see chips that would 404 when clicked. The other-device
            // sync (or observer fetch) sees only what they can actually download.
            return $this->stripUnavailableFileHashes($records);
        });
    }

    /**
     * Replace each record's file_hash with a value that only references blobs
     * currently present in the files table (status != orphaned).
     */
    private function stripUnavailableFileHashes($records)
    {
        $allHashes = [];
        foreach ($records as $r) {
            [, $hashes] = FileService::normalizeFileHash($r->file_hash);
            foreach ($hashes as $h) $allHashes[] = $h;
        }
        if (empty($allHashes)) return $records;

        $available = FileService::buildAvailableHashSet($allHashes);
        foreach ($records as $r) {
            $r->file_hash = FileService::filterAvailableHashes($r->file_hash, $available);
        }
        return $records;
    }

    public function deleteBranch(User $user, string $branchId)
    {
        $deleted = DB::table('blackboards')
            ->where('user_id', $user->id)
            ->where('branch_id', $branchId)
            ->delete();

        if ($deleted) {
            Cache::forget("user:{$user->id}:branches");
            Cache::forget("bb:branch:{$user->id}:{$branchId}:details");
        }

        return $deleted;
    }

    /**
     * Delete ALL of the user's branches (nuclear option from DANGER ZONE).
     * File blobs referenced by these branches are left to the orphan-cleanup
     * cron to handle (per file lifecycle convention).
     */
    public function deleteAllBranches(User $user): int
    {
        $branchIds = DB::table('blackboards')
            ->where('user_id', $user->id)
            ->distinct()
            ->pluck('branch_id');

        $deleted = DB::table('blackboards')
            ->where('user_id', $user->id)
            ->delete();

        Cache::forget("user:{$user->id}:branches");
        foreach ($branchIds as $branchId) {
            Cache::forget("bb:branch:{$user->id}:{$branchId}:details");
        }

        return $deleted;
    }
}
