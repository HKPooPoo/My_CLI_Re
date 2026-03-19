<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Carbon\Carbon;
use App\Events\RestaurantOrderUpdated;
use App\Mail\RestaurantReceiptMail;

class RestaurantOrderService
{
    protected function db()
    {
        return DB::connection('restaurant');
    }

    public function createOrder(array $data): object
    {
        $branchId = null;
        $branchCode = null;

        if (! empty($data['branch_code'])) {
            $branch = $this->db()->table('branches')
                ->where('code', strtoupper($data['branch_code']))
                ->first();
            if ($branch) {
                $branchId = $branch->id;
                $branchCode = $branch->code;
            }
        }

        $orderNumber = $this->generateOrderNumber($branchCode);

        // Build items JSON and compute total
        $items = [];
        $total = 0;
        foreach ($data['items'] as $item) {
            $subtotal = $item['subtotal'];
            $total += $subtotal;
            $items[] = [
                'name' => $item['name'],
                'subtotal' => $subtotal,
                'qty' => $item['qty'] ?? 1,
                'options' => $item['options'] ?? new \stdClass(),
            ];
        }

        $grandTotal = $total + ($data['delivery_fee'] ?? 0);
        $distanceKm = $data['distance_km'] ?? 1.5;
        $estimatedMinutes = (int) round(15 + $distanceKm * 5);

        $orderId = $this->db()->table('orders')->insertGetId([
            'order_number' => $orderNumber,
            'status' => 'pending',
            'total' => $grandTotal,
            'items' => json_encode($items),
            'branch_id' => $branchId,
            'delivery_zone' => $data['delivery_zone'] ?? null,
            'delivery_address' => $data['delivery_address'] ?? null,
            'delivery_fee' => $data['delivery_fee'] ?? 0,
            'customer_name' => $data['customer_name'] ?? null,
            'customer_phone' => $data['customer_phone'] ?? null,
            'customer_email' => $data['customer_email'] ?? null,
            'comment' => $data['comment'] ?? null,
            'estimated_minutes' => $estimatedMinutes,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Cache::forget('restaurant:orders:today');
        event(new RestaurantOrderUpdated($orderNumber, 'created', $branchCode));

        // Send receipt email if provided
        if (! empty($data['customer_email'])) {
            $order = $this->db()->table('orders')->find($orderId);
            Mail::to($data['customer_email'])->queue(new RestaurantReceiptMail($order, $items));
        }

        return (object) [
            'id' => $orderId,
            'order_number' => $orderNumber,
            'total' => $grandTotal,
            'status' => 'pending',
            'estimated_minutes' => $estimatedMinutes,
        ];
    }

    public function getOrder(string $orderNumber): ?object
    {
        $order = $this->db()->table('orders')
            ->where('order_number', $orderNumber)
            ->first();

        if ($order) {
            $order->items = json_decode($order->items ?? '[]');
        }

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
            $order->items = json_decode($order->items ?? '[]');
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
            $order->items = json_decode($order->items ?? '[]');
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

        if ($updated) {
            $updated->items = json_decode($updated->items ?? '[]');
        }

        $branchCode = null;
        if ($updated?->branch_id) {
            $branch = $this->db()->table('branches')->find($updated->branch_id);
            $branchCode = $branch?->code;
        }

        event(new RestaurantOrderUpdated($orderNumber, 'status_changed', $branchCode));

        return $updated;
    }

    /**
     * Generate pickup code: {branch}{2-digit daily seq}-{4-char random}
     * Daily reset like McDonald's. Uses Cache lock to prevent race conditions.
     */
    protected function generateOrderNumber(?string $branchCode = null): string
    {
        $today = Carbon::today()->toDateString();
        $prefix = $branchCode ? strtoupper($branchCode) : 'A';
        $lockKey = "restaurant:order-seq:{$prefix}:{$today}";

        return Cache::lock($lockKey, 5)->block(3, function () use ($today, $prefix) {
            $count = $this->db()->table('orders')
                ->whereDate('created_at', $today)
                ->where('order_number', 'like', $prefix . '%')
                ->count();

            $seq = str_pad($count + 1, 2, '0', STR_PAD_LEFT);
            $rand = substr(bin2hex(random_bytes(2)), 0, 4);

            return $prefix . $seq . '-' . $rand;
        });
    }
}
