<?php
namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * Inbox lifecycle WS event. Public channel pattern mirrors BC —
 * payload carries metadata only (action, last_signal). Clients
 * receiving the event re-fetch via HTTP, where the visibility
 * gate kicks in. No record content rides the wire.
 *
 * Senders use it to know "go check your own submission's
 * feedback_at"; the inbox owner uses it to know "re-pull the
 * submissions list, someone just edited / submitted".
 */
class InboxUpdated implements ShouldBroadcastNow
{
    public function __construct(
        public int    $inboxId,
        public string $name,
        public string $ownerUid,
        public int    $lastSignal,
        public string $action,   // 'create' | 'rename' | 'destroy' | 'submit' | 'feedback' | 'whitelist'
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel("inbox.{$this->inboxId}");
    }

    public function broadcastAs(): string
    {
        return 'inbox.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'inbox_id'    => $this->inboxId,
            'name'        => $this->name,
            'owner_uid'   => $this->ownerUid,
            'last_signal' => $this->lastSignal,
            'action'      => $this->action,
        ];
    }
}
