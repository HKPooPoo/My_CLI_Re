<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Wipe every content table while preserving accounts + ACL.
 *
 *   PRESERVED  → users (rows + passcode + title + email),
 *                whitelists (members), whitelist_distributions
 *
 *   EMPTIED    → blackboards, walkie_typie_connections,
 *                walkie_typie_boards, broadcast_channels,
 *                broadcast_boards, broadcast_pins,
 *                inboxes, inbox_submissions, files;
 *                users.settings → NULL
 *
 * Use case: clear the slate after `whitelist:smoke-seed` has run, so
 * the demonstrator can hand-build the demo scenario through the live
 * UI without colliding with old seeded content. After the manual
 * layout is exactly right, `demo:snapshot` captures the result;
 * `demo:restore` replays it on any deployment.
 */
class DemoWipe extends Command
{
    protected $signature = 'demo:wipe {--force : Skip confirmation}';
    protected $description = 'Wipe all content tables; preserve users + whitelists + distributions';

    public function handle(): int
    {
        if (!$this->option('force')) {
            $this->warn('This will DELETE all notebooks, channels, chats, inboxes,');
            $this->warn('submissions, file rows, and per-user settings. Accounts and');
            $this->warn('whitelists are preserved.');
            if (!$this->confirm('Proceed?', false)) {
                $this->line('Aborted.');
                return self::SUCCESS;
            }
        }

        DB::transaction(function () {
            DB::table('inbox_submissions')->delete();
            DB::table('inboxes')->delete();
            DB::table('broadcast_pins')->delete();
            DB::table('broadcast_boards')->delete();
            DB::table('broadcast_channels')->delete();
            DB::table('walkie_typie_boards')->delete();
            DB::table('walkie_typie_connections')->delete();
            DB::table('blackboards')->delete();
            DB::table('files')->delete();
            DB::table('users')->update(['settings' => null]);
        });

        // File-blob orphans on disk are reclaimed by the existing
        // `files:clean-orphaned` cron — no need to scrub here.
        $this->info('Content wiped. Accounts + whitelists preserved.');
        $this->newLine();
        $this->line('Next steps:');
        $this->line('  1. Login through the live UI and build the demo state by hand.');
        $this->line('  2. `php artisan demo:snapshot` to capture the current state.');
        $this->line('  3. (Anywhere) `php artisan demo:restore` to replay the snapshot.');
        return self::SUCCESS;
    }
}
