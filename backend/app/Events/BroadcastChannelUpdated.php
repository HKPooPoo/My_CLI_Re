<?php
namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class BroadcastChannelUpdated implements ShouldBroadcastNow
{
    public function __construct(
        public int    $channelId,
        public string $name,
        public string $ownerUid,
        public int    $lastSignal,
        public string $action,   // 'cast' | 'rename' | 'destroy'
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel("broadcast-channel.{$this->channelId}");
    }

    public function broadcastAs(): string
    {
        return 'broadcast.channel.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'channel_id'  => $this->channelId,
            'name'        => $this->name,
            'owner_uid'   => $this->ownerUid,
            'last_signal' => $this->lastSignal,
            'action'      => $this->action,
        ];
    }
}
