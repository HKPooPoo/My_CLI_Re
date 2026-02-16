<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WalkieTypieConnectionUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $userUid;
    public $connectionData;

    /**
     * Create a new event instance.
     *
     * @param string $userUid The recipient user's UID
     * @param array $connectionData The connection data for that user
     */
    public function __construct(string $userUid, array $connectionData)
    {
        $this->userUid = $userUid;
        $this->connectionData = $connectionData;
    }

    /**
     * Get the channels the event should broadcast on.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     */
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
}
