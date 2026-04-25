<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;

class WhitelistGrant extends Command
{
    protected $signature = 'whitelist:grant
                            {code : Whitelist code (T2)}
                            {--name= : Distribution rule label (required)}
                            {--title= : Grant to all users with this title}
                            {--uid= : Grant to this specific uid}
                            {--description= : Optional rule description}';

    protected $description = 'Grant a user (by title or uid) permission to apply this whitelist to channels they own';

    public function handle(WhitelistService $service): int
    {
        $code = (string) $this->argument('code');
        $row = $service->findByCode($code);
        if (!$row) {
            $this->error("Whitelist '{$code}' not found.");
            return self::FAILURE;
        }

        $name = $this->option('name');
        if (!$name) {
            $this->error('--name is required.');
            return self::FAILURE;
        }

        $title = $this->option('title');
        $uid   = $this->option('uid');
        if ($title === null && $uid === null) {
            $this->error('At least one of --title or --uid is required.');
            return self::FAILURE;
        }

        $id = $service->addDistribution(
            (int) $row->id,
            (string) $name,
            $title,
            $uid,
            $this->option('description'),
        );
        $this->info("Granted distribution id={$id} on '{$code}'.");
        return self::SUCCESS;
    }
}
