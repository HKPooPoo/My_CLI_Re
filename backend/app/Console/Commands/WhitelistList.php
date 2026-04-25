<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;

class WhitelistList extends Command
{
    protected $signature = 'whitelist:list';
    protected $description = 'List all whitelist presets with member counts';

    public function handle(WhitelistService $service): int
    {
        $rows = $service->listAll();
        if (empty($rows)) {
            $this->info('No whitelists.');
            return self::SUCCESS;
        }
        $this->table(
            ['ID', 'Code', 'Name', 'Members', 'Description'],
            array_map(fn($r) => [
                $r['id'],
                $r['code'],
                $r['name'],
                $r['member_count'],
                $r['description'] ?? '',
            ], $rows)
        );
        return self::SUCCESS;
    }
}
