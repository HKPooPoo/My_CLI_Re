<?php

namespace App\Http\Controllers;

use App\Services\RestaurantOrderService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

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
            'items.*.qty' => 'nullable|integer|min:1',
            'items.*.options' => 'nullable',
            'delivery_zone' => 'nullable|string',
            'delivery_address' => 'nullable|string',
            'delivery_fee' => 'nullable|integer|min:0',
            'distance_km' => 'nullable|numeric|min:0',
            'customer_name' => 'nullable|string|max:100',
            'customer_phone' => 'nullable|string|max:20',
            'customer_email' => 'nullable|email|max:255',
            'comment' => 'nullable|string|max:500',
            'branch_code' => 'nullable|string|max:10',
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

    /**
     * Google Maps Distance Matrix API proxy.
     * Keeps GG_API key server-side.
     */
    public function distance(Request $request)
    {
        $request->validate([
            'origin' => 'required|string|max:500',
            'destination' => 'required|string|max:500',
        ]);

        $key = config('services.google.api_key');
        if (! $key) {
            return response()->json(['message' => 'Google API key not configured'], 500);
        }

        $response = Http::get('https://maps.googleapis.com/maps/api/distancematrix/json', [
            'origins' => $request->input('origin'),
            'destinations' => $request->input('destination'),
            'mode' => 'driving',
            'language' => 'zh-TW',
            'key' => $key,
        ]);

        $data = $response->json();
        $element = $data['rows'][0]['elements'][0] ?? null;

        if (! $element || $element['status'] !== 'OK') {
            return response()->json([
                'message' => 'Cannot calculate distance',
                'api_status' => $element['status'] ?? 'NO_RESULT',
            ], 422);
        }

        return response()->json([
            'distance_meters' => $element['distance']['value'],
            'distance_km' => round($element['distance']['value'] / 1000, 1),
            'distance_text' => $element['distance']['text'],
            'duration_seconds' => $element['duration']['value'],
            'duration_text' => $element['duration']['text'],
        ]);
    }

    /**
     * Stripe Checkout Session — creates a hosted payment page.
     * Test mode: use pk_test_ / sk_test_ keys.
     */
    public function createCheckout(Request $request)
    {
        $request->validate([
            'order_number' => 'required|string',
            'total' => 'required|integer|min:1',
            'items' => 'required|array|min:1',
            'items.*.name' => 'required|string',
            'items.*.subtotal' => 'required|integer|min:0',
            'delivery_fee' => 'nullable|integer|min:0',
            'branch' => 'nullable|string',
        ]);

        $secret = config('services.stripe.secret');
        if (! $secret) {
            return response()->json(['message' => 'Stripe not configured'], 500);
        }

        \Stripe\Stripe::setApiKey($secret);

        $lineItems = collect($request->input('items'))->map(fn ($item) => [
            'price_data' => [
                'currency' => 'hkd',
                'product_data' => ['name' => $item['name']],
                'unit_amount' => $item['subtotal'] * 100,
            ],
            'quantity' => $item['qty'] ?? 1,
        ])->toArray();

        $deliveryFee = $request->input('delivery_fee', 0);
        if ($deliveryFee > 0) {
            $lineItems[] = [
                'price_data' => [
                    'currency' => 'hkd',
                    'product_data' => ['name' => 'Delivery Fee'],
                    'unit_amount' => $deliveryFee * 100,
                ],
                'quantity' => 1,
            ];
        }

        $branch = $request->input('branch', '');
        $baseUrl = $branch
            ? url("/pages/restaurant/{$branch}/menu/")
            : url('/pages/restaurant/menu/');

        $session = \Stripe\Checkout\Session::create([
            'payment_method_types' => ['card'],
            'line_items' => $lineItems,
            'mode' => 'payment',
            'success_url' => $baseUrl . '?payment=success&order=' . $request->input('order_number'),
            'cancel_url' => $baseUrl . '?payment=cancelled&order=' . $request->input('order_number'),
            'metadata' => [
                'order_number' => $request->input('order_number'),
            ],
        ]);

        return response()->json(['checkout_url' => $session->url]);
    }
}
