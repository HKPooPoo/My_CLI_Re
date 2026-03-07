<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class RestaurantOrderUpdated implements ShouldBroadcastNow
{
    public function __construct(
        public string $orderNumber,
        public string $action, // 'created' | 'status_changed'
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel('restaurant-orders');
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
        ];
    }
}
