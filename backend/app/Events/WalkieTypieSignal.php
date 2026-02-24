<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WalkieTypieSignal implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $senderUid;
    public $partnerUid;
    public $branchId;
    public $contentData;

    public function __construct($senderUid, $partnerUid, $branchId)
    {
        $this->senderUid = $senderUid;
        $this->partnerUid = $partnerUid;
        $this->branchId = $branchId;
        $this->contentData = [
            'branch_id' => $branchId,
            'sender_uid' => $senderUid,
            'timestamp' => (int) (microtime(true) * 1000),
            'text' => null
        ];
    }

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

    public function broadcastWith(): array
    {
        return [
            'content_data' => $this->contentData,
        ];
    }
}
