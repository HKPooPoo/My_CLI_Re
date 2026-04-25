<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;

/**
 * Destructive — REPLACES the entire members JSONB with the input
 * list. Uids currently in the set but absent from the input are
 * DROPPED. Use for "re-base the roster at start of semester" type
 * operations. Guarded with confirmation unless --force.
 *
 *   positional:  whitelist:set-members CODE alice bob carol --force
 *   json flag:   whitelist:set-members CODE --json='["alice","bob"]'
 *   stdin:       cat class.txt | docker exec -i ... \
 *                    php artisan whitelist:set-members CODE --force
 *
 * Empty input is treated as "wipe all members" and also gated by
 * the confirmation.
 */
class WhitelistSetMembers extends Command
{
    protected $signature = 'whitelist:set-members
                            {code : Whitelist code}
                            {uids?* : The full desired uid roster (space-separated)}
                            {--json= : JSON array of uids}
                            {--force : Skip confirmation}';

    protected $description = 'Destructively replace the entire members list of a whitelist';

    public function handle(WhitelistService $service): int
    {
        $code = (string) $this->argument('code');
        $row = $service->findByCode($code);
        if (!$row) {
            $this->error("Whitelist '{$code}' not found.");
            return self::FAILURE;
        }

        $uids = $this->collectUids();

        if (!$this->option('force')) {
            $count = count($uids);
            $msg = $count === 0
                ? "REPLACE members of '{$code}' with an EMPTY list (wipes everyone)?"
                : "REPLACE members of '{$code}' with {$count} uid(s), dropping anyone not on this list?";
            if (!$this->confirm($msg)) {
                $this->info('Aborted.');
                return self::SUCCESS;
            }
        }

        $diff = $service->setMembers((int) $row->id, $uids);
        $this->info("Replaced '{$code}': +{$diff['added']} new, -{$diff['removed']} dropped, {$diff['kept']} kept.");
        return self::SUCCESS;
    }

    private function collectUids(): array
    {
        $uids = (array) $this->argument('uids');

        if ($jsonRaw = $this->option('json')) {
            $parsed = json_decode($jsonRaw, true);
            if (!is_array($parsed)) {
                $this->warn('--json input was not a valid JSON array; ignoring.');
            } else {
                $uids = array_merge($uids, $parsed);
            }
        }

        if (empty($uids) && function_exists('stream_isatty') && !stream_isatty(STDIN)) {
            $raw = stream_get_contents(STDIN);
            if (is_string($raw) && trim($raw) !== '') {
                $uids = array_merge($uids, preg_split('/[\s,]+/', trim($raw)));
            }
        }

        return $uids;
    }
}
