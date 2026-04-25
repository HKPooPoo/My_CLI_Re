<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;

class WhitelistShow extends Command
{
    protected $signature = 'whitelist:show {code}';
    protected $description = 'Show full detail of a whitelist (members + distribution grants)';

    public function handle(WhitelistService $service): int
    {
        $code = (string) $this->argument('code');
        $row = $service->findByCode($code);
        if (!$row) {
            $this->error("Whitelist '{$code}' not found.");
            return self::FAILURE;
        }
        $detail = $service->show((int) $row->id);

        $this->info("Whitelist: {$detail['code']} — {$detail['name']}");
        if ($detail['description']) {
            $this->line("  Description: {$detail['description']}");
        }
        $this->line("  Members ({$this->countOf($detail['members'])}): " . implode(', ', $detail['members']));

        $this->newLine();
        $this->info('Distributions (T1 — who can apply this preset):');
        if (empty($detail['distributions'])) {
            $this->line('  (none)');
        } else {
            $this->table(
                ['ID', 'Name', 'Title', 'UID', 'Description'],
                array_map(fn($d) => [
                    $d->id,
                    $d->name,
                    $d->title ?? '—',
                    $d->uid ?? '—',
                    $d->description ?? '',
                ], $detail['distributions'])
            );
        }
        return self::SUCCESS;
    }

    private function countOf(array $arr): int
    {
        return count($arr);
    }
}
