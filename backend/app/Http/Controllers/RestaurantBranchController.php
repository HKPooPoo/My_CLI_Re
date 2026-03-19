<?php

namespace App\Http\Controllers;

use App\Services\RestaurantBranchService;
use App\Services\RestaurantSessionService;
use Illuminate\Http\Request;

class RestaurantBranchController extends Controller
{
    public function __construct(
        protected RestaurantBranchService $branchService,
        protected RestaurantSessionService $sessionService,
    ) {}

    public function index()
    {
        return response()->json($this->branchService->listBranches());
    }

    public function store(Request $request)
    {
        $request->validate([
            'code' => 'required|string|max:10',
            'name' => 'required|string|max:255',
        ]);

        $branch = $this->branchService->createBranch(
            $request->input('code'),
            $request->input('name'),
        );

        return response()->json($branch, 201);
    }

    public function authenticate(Request $request)
    {
        $request->validate([
            'code' => 'required|string',
            'password' => 'required|string',
        ]);

        $branch = $this->branchService->authenticate(
            $request->input('code'),
            $request->input('password'),
        );

        if (! $branch) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        return response()->json([
            'id' => $branch->id,
            'code' => $branch->code,
            'name' => $branch->name,
        ]);
    }

    public function checkIn(Request $request)
    {
        $request->validate([
            'branch_code' => 'required|string',
            'table_number' => 'required|integer|min:1',
        ]);

        $session = $this->sessionService->checkIn(
            $request->input('branch_code'),
            $request->input('table_number'),
        );

        if (! $session) {
            return response()->json(['message' => 'Branch not found'], 404);
        }

        return response()->json($session, 201);
    }

    public function checkOut(Request $request)
    {
        $request->validate([
            'token' => 'required|string',
        ]);

        $closed = $this->sessionService->checkOut($request->input('token'));

        if (! $closed) {
            return response()->json(['message' => 'Session not found or already closed'], 404);
        }

        return response()->json(['message' => 'Checked out']);
    }
}
