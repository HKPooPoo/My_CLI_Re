<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WalkieTypieSignal implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $senderUid;
    public $partnerUid;
    public $branchId;
    public $contentData; // Use unified structure if possible

    /**
     * Create a new event instance.
     */
    public function __construct($senderUid, $partnerUid, $branchId)
    {
        $this->senderUid = $senderUid;
        $this->partnerUid = $partnerUid;
        $this->branchId = $branchId;
        // Construct payload similar to WalkieTypieContentUpdated
        $this->contentData = [
            'branch_id' => $branchId,
            'sender_uid' => $senderUid,
            'timestamp' => (int) (microtime(true) * 1000),
            'text' => null // Signal implies update, but maybe we should include text?
            // BlackboardService calls this AFTER DB update.
            // But BlackboardService doesn't pass text to the event constructor!
            // This is a problem. The receiver needs to know WHAT changed or Fetch it.
        ];
    }

    /**
     * Get the channels the event should broadcast on.
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('App.Models.User.' . $this->partnerUid),
        ];
    }

    public function broadcastAs(): string
    {
        return 'walkie-typie.content';
    }
}
