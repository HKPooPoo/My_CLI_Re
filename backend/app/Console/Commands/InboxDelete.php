<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\InboxService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class InboxDelete extends Command
{
    protected $signature = 'inbox:delete
                            {id : Inbox id}
                            {--force : Skip the confirmation prompt}';

    protected $description = 'Admin: hard-delete an inbox and every submission inside it';

    public function handle(InboxService $service): int
    {
        $id = (int) $this->argument('id');
        $row = DB::table('inboxes')->where('id', $id)->first();
        if (!$row) {
            $this->error("Inbox id={$id} not found.");
            return self::FAILURE;
        }

        if (!$this->option('force')) {
            if (!$this->confirm("Delete inbox '{$row->name}' (id={$id}) and all its submissions?")) {
                $this->info('Cancelled.');
                return self::SUCCESS;
            }
        }

        $owner = User::find($row->user_id);
        $service->deleteInbox($owner, $id);
        $this->info("Deleted inbox '{$row->name}'.");
        return self::SUCCESS;
    }
}
