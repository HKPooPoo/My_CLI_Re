<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class BlackboardController extends Controller
{
    public function commit(Request $request)
    {
        $request->validate([
            'uid' => 'required|string|exists:users,uid',
            'records' => 'required|array',
            'records.*.branch' => 'required|string',
            'records.*.timestamp' => 'required|numeric', // JS timestamp is number
            // 'records.*.text' => 'nullable|string', 
            // 'records.*.created_at' => 'required|string',
        ]);

        $uid = $request->uid;
        $records = $request->records;

        try {
            DB::beginTransaction();

            foreach ($records as $record) {
                DB::table('blackboards')->updateOrInsert(
                    [
                        'user_uid' => $uid,
                        'branch_name' => $record['branch'],
                        'timestamp' => $record['timestamp'],
                    ],
                    [
                        'text' => $record['text'] ?? '',
                        'bin' => $record['bin'] ?? null,
                        'created_at_str' => $record['created_at'] ?? now()->toIso8601String(), // Fallback
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]
                );
            }

            DB::commit();
            return response()->json(['message' => 'As you wish.']);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error($e);
            return response()->json(['message' => 'Commit failed: ' . $e->getMessage()], 500);
        }
    }

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
                    'branch' => $item->branch_name,
                    'timestamp' => (int) $item->timestamp,
                    'text' => $item->text,
                    'bin' => $item->bin,
                    'createdAt' => $item->created_at_str,
                ];
            });

        return response()->json(['records' => $records]);
    }
}
