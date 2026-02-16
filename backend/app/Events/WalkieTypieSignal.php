<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WalkieTypieSignal implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $senderUid;
    public $partnerUid;
    public $branchId;
    public $timestamp;

    /**
     * Create a new event instance.
     */
    public function __construct($senderUid, $partnerUid, $branchId)
    {
        $this->senderUid = $senderUid;
        $this->partnerUid = $partnerUid;
        $this->branchId = $branchId;
        $this->timestamp = (int) (microtime(true) * 1000);
    }

    /**
     * Get the channels the event should broadcast on.
     */
    public function broadcastOn(): array
    {
        // For XP agile prototyping, using a public channel with UID in name
        return [
            new Channel('walkie-typie.' . $this->partnerUid),
        ];
    }

    public function broadcastAs(): string
    {
        return 'signal';
    }
}
