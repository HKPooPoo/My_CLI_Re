<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class InboxList extends Command
{
    protected $signature = 'inbox:list';

    protected $description = 'Admin: list every inbox (across all owners)';

    public function handle(): int
    {
        $rows = DB::table('inboxes')
            ->leftJoin('users', 'inboxes.user_id', '=', 'users.id')
            ->leftJoin('whitelists', 'inboxes.whitelist_id', '=', 'whitelists.id')
            ->orderBy('inboxes.last_signal', 'desc')
            ->select(
                'inboxes.id',
                'inboxes.name',
                'users.uid as owner',
                'whitelists.code as whitelist',
                'inboxes.last_signal',
            )
            ->get();

        if ($rows->isEmpty()) {
            $this->info('No inboxes.');
            return self::SUCCESS;
        }

        $this->table(['id', 'name', 'owner', 'whitelist', 'last_signal'], $rows->map(fn($r) => (array) $r)->toArray());
        return self::SUCCESS;
    }
}
