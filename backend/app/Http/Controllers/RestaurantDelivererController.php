<?php

namespace App\Http\Controllers;

use App\Services\RestaurantDelivererService;
use Illuminate\Http\Request;

class RestaurantDelivererController extends Controller
{
    protected RestaurantDelivererService $service;

    public function __construct(RestaurantDelivererService $service)
    {
        $this->service = $service;
    }

    public function index()
    {
        return response()->json($this->service->list());
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:100',
            'phone' => 'required|string|max:20',
            'password' => 'required|string|min:1',
        ]);

        try {
            $deliverer = $this->service->register(
                $request->input('name'),
                $request->input('phone'),
                $request->input('password'),
            );

            return response()->json([
                'id' => $deliverer->id,
                'name' => $deliverer->name,
                'phone' => $deliverer->phone,
                'status' => $deliverer->status,
            ], 201);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }
    }

    public function authenticate(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'password' => 'required|string',
        ]);

        $deliverer = $this->service->authenticate(
            $request->input('phone'),
            $request->input('password'),
        );

        if (! $deliverer) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        return response()->json([
            'id' => $deliverer->id,
            'name' => $deliverer->name,
            'phone' => $deliverer->phone,
            'status' => $deliverer->status,
        ]);
    }

    public function updateStatus(Request $request, int $id)
    {
        $request->validate([
            'status' => 'required|string|in:idle,delivering,offline',
        ]);

        $deliverer = $this->service->findById($id);
        if (! $deliverer) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $this->service->updateStatus($id, $request->input('status'));

        return response()->json(['status' => $request->input('status')]);
    }

    public function destroy(int $id)
    {
        $deliverer = $this->service->findById($id);
        if (! $deliverer) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $this->service->delete($id);

        return response()->json(null, 204);
    }
}
