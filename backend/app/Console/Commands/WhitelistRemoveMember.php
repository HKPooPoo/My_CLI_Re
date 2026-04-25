<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;

class WhitelistRemoveMember extends Command
{
    protected $signature = 'whitelist:remove-member {code} {uid}';
    protected $description = 'Remove a uid from the whitelist members set';

    public function handle(WhitelistService $service): int
    {
        $code = (string) $this->argument('code');
        $row = $service->findByCode($code);
        if (!$row) {
            $this->error("Whitelist '{$code}' not found.");
            return self::FAILURE;
        }

        $uid = (string) $this->argument('uid');
        if ($service->removeMember((int) $row->id, $uid)) {
            $this->info("Removed '{$uid}' from '{$code}'.");
        } else {
            $this->info("'{$uid}' not in '{$code}', no-op.");
        }
        return self::SUCCESS;
    }
}
