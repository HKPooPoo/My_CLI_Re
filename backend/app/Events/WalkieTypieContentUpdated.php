<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WalkieTypieContentUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $userUid;
    public $contentData;

    public function __construct(string $userUid, array $contentData)
    {
        $this->userUid = $userUid;
        $this->contentData = $contentData;
    }

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

    public function broadcastWith(): array
    {
        return [
            'content_data' => $this->contentData,
        ];
    }
}
