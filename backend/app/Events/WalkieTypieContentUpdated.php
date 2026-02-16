<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WalkieTypieContentUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $userUid;
    public $contentData;

    /**
     * Create a new event instance.
     *
     * @param string $userUid The recipient user's UID (Partner)
     * @param array $contentData Data containing text, branch_id, timestamp
     */
    public function __construct(string $userUid, array $contentData)
    {
        $this->userUid = $userUid;
        $this->contentData = $contentData;
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
        return 'walkie-typie.content';
    }
}
