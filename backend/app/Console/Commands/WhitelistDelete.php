<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;

class WhitelistDelete extends Command
{
    protected $signature = 'whitelist:delete {code} {--force : Skip confirmation}';
    protected $description = 'Delete a whitelist (cascade-deletes its distribution rules; channels using it revert to public)';

    public function handle(WhitelistService $service): int
    {
        $code = (string) $this->argument('code');
        $row = $service->findByCode($code);
        if (!$row) {
            $this->error("Whitelist '{$code}' not found.");
            return self::FAILURE;
        }

        if (!$this->option('force') && !$this->confirm("Delete whitelist '{$code}' and all its distribution rules?")) {
            $this->info('Aborted.');
            return self::SUCCESS;
        }

        $service->delete((int) $row->id);
        $this->info("Deleted whitelist '{$code}'.");
        return self::SUCCESS;
    }
}
