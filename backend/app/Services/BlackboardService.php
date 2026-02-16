<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Models\User;
use App\Events\WalkieTypieSignal;

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
            $this->broadcastUpdate($user, $branchId);
        });
    }

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

    public function fetchBranchDetails(User $user, string $branchId)
    {
        return DB::table('blackboards')
            ->where('owner', $user->uid)
            ->where('branch_id', $branchId)
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
