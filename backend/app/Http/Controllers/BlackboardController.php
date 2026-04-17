<?php

namespace App\Http\Controllers;

use App\Services\BlackboardService;
use App\Http\Requests\Blackboard\CommitRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BlackboardController extends Controller
{
    protected $blackboardService;

    public function __construct(BlackboardService $blackboardService)
    {
        $this->blackboardService = $blackboardService;
    }

    public function commit(CommitRequest $request)
    {
        $user = Auth::user();
        if (!$user) return response()->json(['message' => 'Unauthorized'], 401);

        $this->blackboardService->commit(
            $user,
            $request->branch_id,
            $request->branch_name,
            $request->records,
            $request->input('device_id')
        );

        return response()->json(['message' => 'Commit Successful']);
    }

    public function fetchBranches()
    {
        $user = Auth::user();
        if (!$user) return response()->json(['branches' => []]);

        $branches = $this->blackboardService->fetchBranches($user);
        return response()->json(['branches' => $branches]);
    }

    public function fetchBranchDetails($branchId)
    {
        $user = Auth::user();
        if (!$user) return response()->json(['message' => 'Unauthorized'], 401);

        $records = $this->blackboardService->fetchBranchDetails($user, $branchId);
        return response()->json(['records' => $records]);
    }

    public function destroyBranch($branchId)
    {
        $user = Auth::user();
        if (!$user) return response()->json(['message' => 'Unauthorized'], 401);

        $this->blackboardService->deleteBranch($user, $branchId);
        return response()->json(['message' => 'Remote branch deleted']);
    }

    public function destroyAllBranches()
    {
        $user = Auth::user();
        if (!$user) return response()->json(['message' => 'Unauthorized'], 401);

        $count = $this->blackboardService->deleteAllBranches($user);
        return response()->json(['message' => 'All remote branches deleted', 'count' => $count]);
    }
}
