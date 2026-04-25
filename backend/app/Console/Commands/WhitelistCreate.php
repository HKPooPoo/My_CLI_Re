<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;

class WhitelistCreate extends Command
{
    protected $signature = 'whitelist:create
                            {code : Human-readable identifier (e.g. 2026_SEHH8964)}
                            {name : Display name (e.g. "2026 SEHH8964 Programming Project")}
                            {--description= : Optional description}';

    protected $description = 'Create a new whitelist preset (T2)';

    public function handle(WhitelistService $service): int
    {
        $code = (string) $this->argument('code');
        if ($service->findByCode($code)) {
            $this->error("Whitelist code '{$code}' already exists.");
            return self::FAILURE;
        }

        $id = $service->create($code, (string) $this->argument('name'), $this->option('description'));
        $this->info("Created whitelist '{$code}' (id={$id}).");
        return self::SUCCESS;
    }
}
