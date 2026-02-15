<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class BlackboardController extends Controller
{
    /**
     * Commit: 上傳/更新分支所有歷史紀錄
     */
    public function commit(Request $request)
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['message' => 'Unauthorized'], 401);

        $branchId = $request->input('branchId');
        $branchName = $request->input('branchName');
        $records = $request->input('records'); // 陣列

        if (!$branchId || !is_array($records)) {
            return response()->json(['message' => 'Invalid Data'], 400);
        }

        return DB::transaction(function () use ($user, $branchId, $branchName, $records) {
            $insertData = [];
            foreach ($records as $record) {
                $insertData[] = [
                    'owner' => $user->uid,
                    'branch_id' => $branchId,
                    'branch_name' => $branchName,
                    'timestamp' => $record['timestamp'],
                    'text' => $record['text'],
                    'bin' => $record['bin'] ?? null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            if (!empty($insertData)) {
                // 使用 Laravel 內建的 upsert
                DB::table('blackboards')->upsert(
                    $insertData,
                    ['owner', 'branch_id', 'timestamp'], // 唯一判定鍵
                    ['branch_name', 'text', 'bin', 'updated_at'] // 衝突時更新的欄位
                );
            }

            return response()->json(['message' => 'Commit Successful']);
        });
    }

    /**
     * 獲取目前登入使用者的所有雲端分支
     */
    public function fetchBranches()
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['branches' => []]);

        // 只抓出獨特的 branch_id 及其最新資訊
        $branches = DB::table('blackboards')
            ->where('owner', $user->uid)
            ->select('branch_id', 'branch_name', 'owner', DB::raw('MAX(timestamp) as last_update'))
            ->groupBy('branch_id', 'branch_name', 'owner')
            ->orderBy('last_update', 'desc')
            ->get();

        return response()->json(['branches' => $branches]);
    }

    /**
     * 獲取特定分支的所有紀錄 (用於 Checkout 下載到本地)
     */
    public function fetchBranchDetails($branchId)
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['message' => 'Unauthorized'], 401);

        $records = DB::table('blackboards')
            ->where('owner', $user->uid)
            ->where('branch_id', $branchId)
            ->orderBy('timestamp', 'asc')
            ->get();

        return response()->json(['records' => $records]);
    }

    /**
     * 刪除雲端分支 (Stage 2)
     */
    public function destroyBranch($branchId)
    {
        $user = Auth::user();
        if (!$user)
            return response()->json(['message' => 'Unauthorized'], 401);

        DB::table('blackboards')
            ->where('owner', $user->uid)
            ->where('branch_id', $branchId)
            ->delete();

        return response()->json(['message' => 'Remote branch deleted']);
    }
}
