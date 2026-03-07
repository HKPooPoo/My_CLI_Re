<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class RestaurantOrderService
{
    protected function db()
    {
        return DB::connection('restaurant');
    }

    public function createOrder(array $items): object
    {
        return $this->db()->transaction(function () use ($items) {
            $orderNumber = $this->generateOrderNumber();
            $total = 0;

            $orderId = $this->db()->table('orders')->insertGetId([
                'order_number' => $orderNumber,
                'status' => 'preparing',
                'total' => 0,
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

    public function listTodayOrders(): array
    {
        $today = Carbon::today()->toDateString();

        $orders = $this->db()->table('orders')
            ->whereDate('created_at', $today)
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

        return $this->db()->table('orders')
            ->where('order_number', $orderNumber)
            ->first();
    }

    protected function generateOrderNumber(): string
    {
        $today = Carbon::today()->toDateString();
        $prefix = 'A';

        $lastOrder = $this->db()->table('orders')
            ->whereDate('created_at', $today)
            ->orderByDesc('order_number')
            ->first();

        if (! $lastOrder) {
            return $prefix . '001';
        }

        $lastSeq = (int) substr($lastOrder->order_number, 1);
        $nextSeq = $lastSeq + 1;

        return $prefix . str_pad($nextSeq, 3, '0', STR_PAD_LEFT);
    }
}
