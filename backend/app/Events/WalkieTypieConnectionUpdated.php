<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WalkieTypieConnectionUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $userUid;
    public $connectionData;

    public function __construct(string $userUid, array $connectionData)
    {
        $this->userUid = $userUid;
        $this->connectionData = $connectionData;
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('App.Models.User.' . $this->userUid),
        ];
    }

    public function broadcastAs(): string
    {
        return 'walkie-typie.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'connection_data' => $this->connectionData,
        ];
    }
}
