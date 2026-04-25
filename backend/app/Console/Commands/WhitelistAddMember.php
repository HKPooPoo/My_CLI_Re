<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;

class WhitelistAddMember extends Command
{
    protected $signature = 'whitelist:add-member {code} {uid}';
    protected $description = 'Add a single uid to the whitelist members set';

    public function handle(WhitelistService $service): int
    {
        $code = (string) $this->argument('code');
        $row = $service->findByCode($code);
        if (!$row) {
            $this->error("Whitelist '{$code}' not found.");
            return self::FAILURE;
        }

        $uid = (string) $this->argument('uid');
        if ($service->addMember((int) $row->id, $uid)) {
            $this->info("Added '{$uid}' to '{$code}'.");
        } else {
            $this->info("'{$uid}' already in '{$code}', no-op.");
        }
        return self::SUCCESS;
    }
}
