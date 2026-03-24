<?php

namespace App\Restaurant\Controllers;

use App\Http\Controllers\Controller;
use App\Restaurant\Services\RestaurantBranchService;
use Illuminate\Http\Request;

class RestaurantBranchController extends Controller
{
    public function __construct(
        protected RestaurantBranchService $branchService,
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

}
