<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class BlackboardUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $uid;
    public $branchId;
    public $deviceId;

    public function __construct($uid, $branchId, $deviceId)
    {
        $this->uid = $uid;
        $this->branchId = $branchId;
        $this->deviceId = $deviceId;
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('App.Models.User.' . $this->uid),
        ];
    }

    public function broadcastAs(): string
    {
        return 'blackboard.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'branch_id' => $this->branchId,
            'device_id' => $this->deviceId,
        ];
    }
}
