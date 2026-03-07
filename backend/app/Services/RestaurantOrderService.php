<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
use App\Events\RestaurantOrderUpdated;

class RestaurantOrderService
{
    protected function db()
    {
        return DB::connection('restaurant');
    }

    public function createOrder(array $items, ?string $sessionToken = null): object
    {
        return $this->db()->transaction(function () use ($items, $sessionToken) {
            $branchId = null;
            $tableNumber = null;
            $branchCode = null;

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

            $orderId = $this->db()->table('orders')->insertGetId([
                'order_number' => $orderNumber,
                'status' => 'preparing',
                'total' => 0,
                'branch_id' => $branchId,
                'table_number' => $tableNumber,
                'session_token' => $sessionToken,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach ($items as $item) {
                $subtotal = $item['subtotal'];
                $total += $subtotal;

                $this->db()->table('order_items')->insert([
                    'order_id' => $orderId,
                    'menu_item_id' => null,
                    'name' => $item['name'],
                    'base_price' => $item['base_price'],
                    'qty' => $item['qty'] ?? 1,
                    'options' => json_encode($item['options'] ?? new \stdClass()),
                    'subtotal' => $subtotal,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            $this->db()->table('orders')
                ->where('id', $orderId)
                ->update(['total' => $total]);

            event(new RestaurantOrderUpdated($orderNumber, 'created', $branchCode));

            return (object) [
                'id' => $orderId,
                'order_number' => $orderNumber,
                'total' => $total,
                'status' => 'preparing',
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
            ->orderByRaw("CASE WHEN status = 'preparing' THEN 0 ELSE 1 END")
            ->orderBy('created_at', 'asc')
            ->get();

        foreach ($orders as $order) {
            $order->items = $this->db()->table('order_items')
                ->where('order_id', $order->id)
                ->get();
        }

        return $orders->toArray();
    }

    public function updateStatus(string $orderNumber, string $status): ?object
    {
        $affected = $this->db()->table('orders')
            ->where('order_number', $orderNumber)
            ->update([
                'status' => $status,
                'updated_at' => now(),
            ]);

        if (! $affected) {
            return null;
        }

        $order = $this->db()->table('orders')
            ->where('order_number', $orderNumber)
            ->first();

        $branchCode = null;
        if ($order && $order->branch_id) {
            $branch = $this->db()->table('branches')->find($order->branch_id);
            $branchCode = $branch?->code;
        }

        event(new RestaurantOrderUpdated($orderNumber, 'status_changed', $branchCode));

        return $order;
    }

    protected function generateOrderNumber(?string $branchCode = null): string
    {
        $today = Carbon::today()->toDateString();
        $prefix = $branchCode ? strtoupper($branchCode) : 'A';

        $lastOrder = $this->db()->table('orders')
            ->whereDate('created_at', $today)
            ->where('order_number', 'like', $prefix . '%')
            ->orderByDesc('order_number')
            ->first();

        if (! $lastOrder) {
            return $prefix . '001';
        }

        $lastSeq = (int) substr($lastOrder->order_number, strlen($prefix));
        $nextSeq = $lastSeq + 1;

        return $prefix . str_pad($nextSeq, 3, '0', STR_PAD_LEFT);
    }
}
