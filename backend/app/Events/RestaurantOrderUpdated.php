<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class RestaurantOrderUpdated implements ShouldBroadcastNow
{
    public function __construct(
        public string $orderNumber,
        public string $action, // 'created' | 'status_changed'
        public ?string $branchCode = null,
    ) {}

    public function broadcastOn(): Channel
    {
        $channel = $this->branchCode
            ? 'restaurant-orders.' . $this->branchCode
            : 'restaurant-orders';

        return new Channel($channel);
    }

    public function broadcastAs(): string
    {
        return 'restaurant.order.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'order_number' => $this->orderNumber,
            'action' => $this->action,
            'branch_code' => $this->branchCode,
        ];
    }
}
