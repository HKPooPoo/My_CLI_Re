<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\InboxService;
use App\Services\WhitelistService;
use Illuminate\Console\Command;

class InboxCreate extends Command
{
    protected $signature = 'inbox:create
                            {name : Inbox display name (must be unique)}
                            {owner_uid : Owner uid (a user with a non-null title)}
                            {--description= : Optional description}
                            {--whitelist= : Optional whitelist code to apply (owner must hold T1 grant)}';

    protected $description = 'Admin: create a new inbox owned by {owner_uid}';

    public function handle(InboxService $service, WhitelistService $whitelistService): int
    {
        $owner = User::where('uid', (string) $this->argument('owner_uid'))->first();
        if (!$owner) {
            $this->error('Owner uid not found.');
            return self::FAILURE;
        }

        $whitelistId = null;
        if ($this->option('whitelist')) {
            $row = $whitelistService->findByCode((string) $this->option('whitelist'));
            if (!$row) {
                $this->error('Whitelist code not found.');
                return self::FAILURE;
            }
            $whitelistId = (int) $row->id;
        }

        $inbox = $service->createInbox(
            $owner,
            (string) $this->argument('name'),
            $this->option('description'),
            $whitelistId,
        );

        $this->info("Created inbox '{$inbox->name}' (id={$inbox->id}).");
        return self::SUCCESS;
    }
}
