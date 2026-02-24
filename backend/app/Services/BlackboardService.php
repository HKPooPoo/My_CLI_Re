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
                ->where('owner', $user->uid)
                ->where('branch_id', $branchId)
                ->whereNotIn('timestamp', $incomingTimestamps)
                ->delete();

            $insertData = [];
            $fileHashes = [];
            foreach ($records as $record) {
                $text = $record['text'] ?? '';
                if (trim($text) === "" && empty($record['bin'])) {
                    continue;
                }

                $bin = $record['bin'] ?? null;
                if ($bin) {
                    $fileHashes[] = $bin;
                }

                $insertData[] = [
                    'owner' => $user->uid,
                    'branch_id' => $branchId,
                    'branch_name' => $branchName,
                    'timestamp' => $record['timestamp'],
                    'text' => $text,
                    'bin' => $bin,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            if (!empty($insertData)) {
                DB::table('blackboards')->upsert(
                    $insertData,
                    ['owner', 'branch_id', 'timestamp'],
                    ['branch_name', 'text', 'bin', 'updated_at']
                );
            }

            // Mark referenced files as committed
            foreach ($fileHashes as $hash) {
                $this->fileService->markCommitted($hash);
            }

            Cache::forget("user:{$user->uid}:branches");
            Cache::forget("bb:branch:{$user->uid}:{$branchId}:details");
        });
    }


    public function fetchBranches(User $user)
    {
        return Cache::remember("user:{$user->uid}:branches", 15, function () use ($user) {
            return DB::table('blackboards')
                ->where('owner', $user->uid)
                ->select('branch_id', 'branch_name', 'owner', DB::raw('MAX(timestamp) as last_update'))
                ->groupBy('branch_id', 'branch_name', 'owner')
                ->orderBy('last_update', 'desc')
                ->get();
        });
    }

    public function fetchBranchDetails($user, $branchId)
    {
        // Blackboard only: Check if user owns the branch
        $isOwner = DB::table('blackboards')
            ->where('branch_id', $branchId)
            ->where('owner', $user->uid)
            ->exists();

        if (!$isOwner) {
            return [];
        }

        return Cache::remember("bb:branch:{$user->uid}:{$branchId}:details", 30, fn() =>
            DB::table('blackboards')
                ->leftJoin('files', 'blackboards.bin', '=', 'files.hash')
                ->where('blackboards.branch_id', $branchId)
                ->where('blackboards.owner', $user->uid)
                ->orderBy('blackboards.timestamp', 'asc')
                ->select(
                    'blackboards.*',
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
            ->where('owner', $user->uid)
            ->where('branch_id', $branchId)
            ->delete();

        if ($deleted) {
            Cache::forget("user:{$user->uid}:branches");
            Cache::forget("bb:branch:{$user->uid}:{$branchId}:details");
        }

        return $deleted;
    }
}
