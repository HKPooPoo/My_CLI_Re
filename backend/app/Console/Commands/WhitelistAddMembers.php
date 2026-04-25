<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;

/**
 * Batch insert (union). Any of three input channels works, pick
 * whichever matches your ergonomics — they're combined before
 * being merged into the JSONB members set.
 *
 *   positional:  whitelist:add-members CODE alice bob carol
 *   json flag:   whitelist:add-members CODE --json='["alice","bob"]'
 *   stdin:       cat class.txt | docker exec -i ... \
 *                    php artisan whitelist:add-members CODE
 *
 * stdin parses on whitespace (space, tab, newline) so a file with
 * one uid per line, a comma-separated list, or even shell output
 * all work. Duplicates anywhere in the combined input silently
 * collapse — the underlying JSONB set semantics are the truth.
 */
class WhitelistAddMembers extends Command
{
    protected $signature = 'whitelist:add-members
                            {code : Whitelist code}
                            {uids?* : One or more uids to add (space-separated)}
                            {--json= : JSON array of uids}';

    protected $description = 'Batch-add multiple uids to a whitelist (union; duplicates ignored)';

    public function handle(WhitelistService $service): int
    {
        $code = (string) $this->argument('code');
        $row = $service->findByCode($code);
        if (!$row) {
            $this->error("Whitelist '{$code}' not found.");
            return self::FAILURE;
        }

        $uids = $this->collectUids();
        if (empty($uids)) {
            $this->error('No uids provided. Pass positional args, --json=..., or pipe via stdin.');
            return self::FAILURE;
        }

        $added = $service->addMembers((int) $row->id, $uids);
        $this->info("Received " . count($uids) . " uid(s); added {$added} new (others already members).");
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

        // STDIN fallback — only consume when no positional / --json was
        // given and stdin is actually piped (not an interactive TTY).
        if (empty($uids) && function_exists('stream_isatty') && !stream_isatty(STDIN)) {
            $raw = stream_get_contents(STDIN);
            if (is_string($raw) && trim($raw) !== '') {
                $uids = array_merge($uids, preg_split('/[\s,]+/', trim($raw)));
            }
        }

        return $uids;
    }
}
