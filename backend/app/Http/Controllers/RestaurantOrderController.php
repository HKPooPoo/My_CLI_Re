<?php

namespace App\Http\Controllers;

use App\Services\RestaurantOrderService;
use Illuminate\Http\Request;

class RestaurantOrderController extends Controller
{
    protected RestaurantOrderService $orderService;

    public function __construct(RestaurantOrderService $orderService)
    {
        $this->orderService = $orderService;
    }

    public function index(Request $request)
    {
        $branchCode = $request->query('branch');

        return response()->json($this->orderService->listTodayOrders($branchCode));
    }

    public function store(Request $request)
    {
        $request->validate([
            'items' => 'required|array|min:1',
            'items.*.name' => 'required|string',
            'items.*.subtotal' => 'required|integer|min:0',
            'items.*.options' => 'nullable',
            'delivery_zone' => 'nullable|string',
            'delivery_address' => 'nullable|string',
            'delivery_fee' => 'nullable|integer|min:0',
            'distance_km' => 'nullable|numeric|min:0',
            'customer_name' => 'nullable|string|max:100',
            'customer_phone' => 'nullable|string|max:20',
            'customer_email' => 'nullable|email|max:255',
            'comment' => 'nullable|string|max:500',
            'session_token' => 'nullable|string',
        ]);

        $order = $this->orderService->createOrder($request->all());

        return response()->json([
            'order_number' => $order->order_number,
            'total' => $order->total,
            'status' => $order->status,
            'estimated_minutes' => $order->estimated_minutes,
        ], 201);
    }

    public function show(string $orderNumber)
    {
        $order = $this->orderService->getOrder($orderNumber);

        if (! $order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        return response()->json($order);
    }

    public function showByPickupCode(string $code)
    {
        $order = $this->orderService->getOrder($code);

        if (! $order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        return response()->json($order);
    }

    public function updateStatus(Request $request, string $orderNumber)
    {
        $request->validate([
            'status' => 'required|string|in:pending,printed,delivering,delivered',
            'deliverer_id' => 'nullable|integer',
        ]);

        $order = $this->orderService->updateStatus(
            $orderNumber,
            $request->input('status'),
            $request->only('deliverer_id'),
        );

        if (! $order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        return response()->json($order);
    }

    public function listByDeliverer(int $delivererId)
    {
        return response()->json($this->orderService->listByDeliverer($delivererId));
    }
}
