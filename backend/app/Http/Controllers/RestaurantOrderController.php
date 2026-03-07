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

    public function index()
    {
        return response()->json($this->orderService->listTodayOrders());
    }

    public function updateStatus(Request $request, string $orderNumber)
    {
        $request->validate([
            'status' => 'required|string|in:preparing,ready',
        ]);

        $order = $this->orderService->updateStatus($orderNumber, $request->input('status'));

        if (! $order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        return response()->json($order);
    }

    public function store(Request $request)
    {
        $request->validate([
            'items' => 'required|array|min:1',
            'items.*.name' => 'required|string',
            'items.*.base_price' => 'required|integer|min:0',
            'items.*.subtotal' => 'required|integer|min:0',
            'items.*.options' => 'nullable|array',
        ]);

        $order = $this->orderService->createOrder($request->input('items'));

        return response()->json([
            'order_number' => $order->order_number,
            'total' => $order->total,
            'status' => $order->status,
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
}
