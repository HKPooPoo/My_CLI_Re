<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Models\User;

class BlackboardService
{
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
                DB::table('blackboards')->upsert(
                    $insertData,
                    ['owner', 'branch_id', 'timestamp'],
                    ['branch_name', 'text', 'bin', 'updated_at']
                );
            }

            Cache::forget("user:{$user->uid}:branches");
        });
    }


    public function fetchBranches(User $user)
    {
        return Cache::remember("user:{$user->uid}:branches", 5, function () use ($user) {
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

        return DB::table('blackboards')
            ->where('branch_id', $branchId)
            ->where('owner', $user->uid)
            ->orderBy('timestamp', 'asc')
            ->get();
    }

    public function deleteBranch(User $user, string $branchId)
    {
        $deleted = DB::table('blackboards')
            ->where('owner', $user->uid)
            ->where('branch_id', $branchId)
            ->delete();

        if ($deleted) {
            Cache::forget("user:{$user->uid}:branches");
        }

        return $deleted;
    }
}
