<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Carbon\Carbon;
use App\Events\RestaurantOrderUpdated;

class RestaurantOrderService
{
    protected function db()
    {
        return DB::connection('restaurant');
    }

    public function createOrder(array $data): object
    {
        return $this->db()->transaction(function () use ($data) {
            $branchId = null;
            $tableNumber = null;
            $branchCode = null;

            $sessionToken = $data['session_token'] ?? null;
            if ($sessionToken) {
                $session = $this->db()->table('restaurant_sessions')
                    ->join('branches', 'restaurant_sessions.branch_id', '=', 'branches.id')
                    ->where('restaurant_sessions.token', $sessionToken)
                    ->where('restaurant_sessions.status', 'active')
                    ->where('restaurant_sessions.expires_at', '>', now())
                    ->select('restaurant_sessions.branch_id', 'restaurant_sessions.table_number', 'branches.code as branch_code')
                    ->first();

                if ($session) {
                    $branchId = $session->branch_id;
                    $tableNumber = $session->table_number;
                    $branchCode = $session->branch_code;
                }
            }

            $orderNumber = $this->generateOrderNumber($branchCode);
            $total = 0;

            $distanceKm = $data['distance_km'] ?? 1.5;
            $estimatedMinutes = (int) round(15 + $distanceKm * 5);

            $orderId = $this->db()->table('orders')->insertGetId([
                'order_number' => $orderNumber,
                'status' => 'pending',
                'total' => 0,
                'branch_id' => $branchId,
                'table_number' => $tableNumber,
                'session_token' => $sessionToken,
                'delivery_zone' => $data['delivery_zone'] ?? null,
                'delivery_address' => $data['delivery_address'] ?? null,
                'delivery_fee' => $data['delivery_fee'] ?? 0,
                'customer_name' => $data['customer_name'] ?? null,
                'customer_phone' => $data['customer_phone'] ?? null,
                'comment' => $data['comment'] ?? null,
                'estimated_minutes' => $estimatedMinutes,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach ($data['items'] as $item) {
                $subtotal = $item['subtotal'];
                $total += $subtotal;

                $this->db()->table('order_items')->insert([
                    'order_id' => $orderId,
                    'menu_item_id' => null,
                    'name' => $item['name'],
                    'base_price' => $item['base_price'] ?? $item['subtotal'],
                    'qty' => $item['qty'] ?? 1,
                    'options' => json_encode($item['options'] ?? new \stdClass()),
                    'subtotal' => $subtotal,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            $grandTotal = $total + ($data['delivery_fee'] ?? 0);
            $this->db()->table('orders')
                ->where('id', $orderId)
                ->update(['total' => $grandTotal]);

            Cache::forget('restaurant:orders:today');

            event(new RestaurantOrderUpdated($orderNumber, 'created', $branchCode));

            return (object) [
                'id' => $orderId,
                'order_number' => $orderNumber,
                'total' => $grandTotal,
                'status' => 'pending',
                'estimated_minutes' => $estimatedMinutes,
            ];
        });
    }

    public function getOrder(string $orderNumber): ?object
    {
        $order = $this->db()->table('orders')
            ->where('order_number', $orderNumber)
            ->first();

        if (! $order) {
            return null;
        }

        $order->items = $this->db()->table('order_items')
            ->where('order_id', $order->id)
            ->get();

        return $order;
    }

    public function getOrderByToken(string $qrToken): ?object
    {
        $order = $this->db()->table('orders')
            ->where('qr_token', $qrToken)
            ->first();

        if (! $order) {
            return null;
        }

        $order->items = $this->db()->table('order_items')
            ->where('order_id', $order->id)
            ->get();

        return $order;
    }

    public function listTodayOrders(?string $branchCode = null): array
    {
        $today = Carbon::today()->toDateString();

        $query = $this->db()->table('orders')
            ->whereDate('created_at', $today);

        if ($branchCode) {
            $branch = $this->db()->table('branches')
                ->where('code', strtoupper($branchCode))
                ->first();
            if ($branch) {
                $query->where('branch_id', $branch->id);
            } else {
                return [];
            }
        }

        $orders = $query
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 WHEN status = 'printed' THEN 1 WHEN status = 'delivering' THEN 2 ELSE 3 END")
            ->orderBy('created_at', 'asc')
            ->get();

        foreach ($orders as $order) {
            $order->items = $this->db()->table('order_items')
                ->where('order_id', $order->id)
                ->get();
        }

        return $orders->toArray();
    }

    public function listByDeliverer(int $delivererId): array
    {
        $orders = $this->db()->table('orders')
            ->where('deliverer_id', $delivererId)
            ->orderBy('created_at', 'desc')
            ->get();

        foreach ($orders as $order) {
            $order->items = $this->db()->table('order_items')
                ->where('order_id', $order->id)
                ->get();
        }

        return $orders->toArray();
    }

    /**
     * Status flow: pending → printed → delivering → delivered
     */
    public function updateStatus(string $orderNumber, string $status, array $extra = []): ?object
    {
        $order = $this->db()->table('orders')
            ->where('order_number', $orderNumber)
            ->first();

        if (! $order) {
            return null;
        }

        $patch = [
            'status' => $status,
            'updated_at' => now(),
        ];

        if ($status === 'printed') {
            $patch['printed_at'] = now();
        }

        if ($status === 'delivering' && isset($extra['deliverer_id'])) {
            $patch['deliverer_id'] = $extra['deliverer_id'];
        }

        if ($status === 'delivered') {
            $patch['delivered_at'] = now();
        }

        $this->db()->table('orders')
            ->where('order_number', $orderNumber)
            ->update($patch);

        Cache::forget('restaurant:orders:today');

        $updated = $this->db()->table('orders')
            ->where('order_number', $orderNumber)
            ->first();

        $branchCode = null;
        if ($updated && $updated->branch_id) {
            $branch = $this->db()->table('branches')->find($updated->branch_id);
            $branchCode = $branch?->code;
        }

        event(new RestaurantOrderUpdated($orderNumber, 'status_changed', $branchCode));

        return $updated;
    }

    /**
     * Generate pickup code: {branch}{2-digit daily seq}-{4-char random}
     * e.g. TM01-a3f8, A01-d4e2
     * Daily reset like McDonald's. 2 digits = 99 orders/day/branch.
     * 4-char random prevents guessing.
     */
    protected function generateOrderNumber(?string $branchCode = null): string
    {
        $today = Carbon::today()->toDateString();
        $prefix = $branchCode ? strtoupper($branchCode) : 'A';

        $count = $this->db()->table('orders')
            ->whereDate('created_at', $today)
            ->where('order_number', 'like', $prefix . '%')
            ->count();

        $seq = str_pad($count + 1, 2, '0', STR_PAD_LEFT);
        $rand = substr(bin2hex(random_bytes(2)), 0, 4);

        return $prefix . $seq . '-' . $rand;
    }
}
