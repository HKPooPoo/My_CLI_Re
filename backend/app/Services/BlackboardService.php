<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Models\User;

class BlackboardService
{
    protected FileService $fileService;

    public function __construct(FileService $fileService)
    {
        $this->fileService = $fileService;
    }

    public function commit(User $user, string $branchId, string $branchName, array $records)
    {
        return DB::transaction(function () use ($user, $branchId, $branchName, $records) {
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

                $fileHash = $record['file_hash'] ?? null;
                if ($fileHash) {
                    $fileHashes[] = $fileHash;
                }

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
                DB::table('blackboards')->upsert(
                    $insertData,
                    ['user_id', 'branch_id', 'timestamp'],
                    ['branch_name', 'text', 'file_hash', 'updated_at']
                );
            }

            foreach ($fileHashes as $hash) {
                $this->fileService->markCommitted($hash);
            }

            Cache::forget("user:{$user->id}:branches");
            Cache::forget("bb:branch:{$user->id}:{$branchId}:details");
        });
    }


    public function fetchBranches(User $user)
    {
        return Cache::remember("user:{$user->id}:branches", 15, function () use ($user) {
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

        return Cache::remember("bb:branch:{$user->id}:{$branchId}:details", 30, fn() =>
            DB::table('blackboards')
                ->join('users', 'blackboards.user_id', '=', 'users.id')
                ->leftJoin('files', 'blackboards.file_hash', '=', 'files.hash')
                ->where('blackboards.branch_id', $branchId)
                ->where('blackboards.user_id', $user->id)
                ->orderBy('blackboards.timestamp', 'asc')
                ->select(
                    'blackboards.*',
                    'users.uid',
                    'files.original_name as file_name',
                    'files.size as file_size',
                    'files.mime_type as file_mime'
                )
                ->get()
        );
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
}
