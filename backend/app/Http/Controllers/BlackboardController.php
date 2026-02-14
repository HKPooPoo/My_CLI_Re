<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class BlackboardController extends Controller
{
    /**
     * Commit: 上傳本地分支至雲端，以 branch_id 作為唯一識別
     */
    public function commit(Request $request)
    {
        $request->validate([
            'uid' => 'required|string|exists:users,uid',
            'records' => 'required|array',
            'records.*.branchId' => 'required|string',
            'records.*.branchName' => 'required|string',
            'records.*.timestamp' => 'required|numeric',
        ]);

        $uid = $request->uid;
        $records = $request->records;

        try {
            DB::beginTransaction();

            foreach ($records as $record) {
                // 以 branch_id + timestamp 作為更新基準，而非 branch_name
                DB::table('blackboards')->updateOrInsert(
                    [
                        'user_uid' => $uid,
                        'branch_id' => $record['branchId'],
                        'timestamp' => $record['timestamp'],
                    ],
                    [
                        'branch_name' => $record['branchName'],
                        'text' => $record['text'] ?? '',
                        'bin' => $record['bin'] ?? null,
                        'created_at_str' => $record['createdAt'] ?? now()->toIso8601String(),
                        'updated_at' => now(),
                    ]
                );
            }

            DB::commit();
            return response()->json(['message' => 'Sync successful.']);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error($e);
            return response()->json(['message' => 'Commit failed: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Checkout: 抓取使用者的所有同步記錄
     */
    public function checkout(Request $request)
    {
        $request->validate([
            'uid' => 'required|string|exists:users,uid',
        ]);

        $uid = $request->uid;

        $records = DB::table('blackboards')
            ->where('user_uid', $uid)
            ->get()
            ->map(function ($item) {
                return [
                    'owner' => $item->user_uid,
                    'branchId' => $item->branch_id,
                    'branchName' => $item->branch_name,
                    'timestamp' => (int) $item->timestamp,
                    'text' => $item->text,
                    'bin' => $item->bin,
                    'createdAt' => $item->created_at_str,
                ];
            });

        return response()->json(['records' => $records]);
    }

    /**
     * Drop: 刪除雲端特定的分支 (依據 branch_id)
     */
    public function drop(Request $request)
    {
        $request->validate([
            'uid' => 'required|string|exists:users,uid',
            'branchId' => 'required|string',
        ]);

        $uid = $request->uid;
        $branchId = $request->branchId;

        try {
            DB::table('blackboards')
                ->where('user_uid', $uid)
                ->where('branch_id', $branchId)
                ->delete();

            return response()->json(['message' => "Branch $branchId deleted from cloud."]);
        } catch (\Exception $e) {
            Log::error($e);
            return response()->json(['message' => 'Drop failed: ' . $e->getMessage()], 500);
        }
    }
}
