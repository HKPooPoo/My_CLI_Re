<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;

class WhitelistUngrant extends Command
{
    protected $signature = 'whitelist:ungrant {distributionId}';
    protected $description = 'Remove a distribution rule by id';

    public function handle(WhitelistService $service): int
    {
        $id = (int) $this->argument('distributionId');
        if ($service->removeDistribution($id)) {
            $this->info("Removed distribution id={$id}.");
            return self::SUCCESS;
        }
        $this->error("Distribution id={$id} not found.");
        return self::FAILURE;
    }
}
