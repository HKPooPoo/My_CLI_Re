<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;

class WhitelistAddByTitle extends Command
{
    protected $signature = 'whitelist:add-by-title {code} {title}';
    protected $description = 'Bulk-add all users currently carrying the given title to the whitelist';

    public function handle(WhitelistService $service): int
    {
        $code = (string) $this->argument('code');
        $row = $service->findByCode($code);
        if (!$row) {
            $this->error("Whitelist '{$code}' not found.");
            return self::FAILURE;
        }

        $title = (string) $this->argument('title');
        $added = $service->addMembersByTitle((int) $row->id, $title);
        $this->info("Added {$added} new uid(s) to '{$code}' (existing members skipped).");
        return self::SUCCESS;
    }
}
