<?php

namespace App\Console\Commands;

use App\Services\FileService;
use Illuminate\Console\Command;

class CleanOrphanedFiles extends Command
{
    protected $signature = 'files:clean-orphaned';

    protected $description = 'Mark unreferenced files as orphaned and delete files orphaned for 24+ hours';

    public function handle(FileService $fileService): int
    {
        $marked = $fileService->markOrphaned();
        $this->info("Marked {$marked} file(s) as orphaned.");

        $deleted = $fileService->cleanupOrphaned(24);
        $this->info("Deleted {$deleted} orphaned file(s) older than 24 hours.");

        return self::SUCCESS;
    }
}
