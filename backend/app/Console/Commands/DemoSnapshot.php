<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

/**
 * Dump the current content state to a JSON file replayable by
 * `demo:restore`. Uses NATURAL KEYS (uid, branch_id, channel name,
 * inbox name, whitelist code) so the dump can be replayed against
 * any deployment whose accounts + whitelists already exist.
 *
 * Skipped: file blobs on disk. The dump records `file_hash` strings
 * but the actual binary content is not portable. Chips that reference
 * missing hashes will simply not render after restore (handled by
 * `FileService::buildAvailableHashSet` filter). For a full demo
 * including files, restore against the same machine.
 */
class DemoSnapshot extends Command
{
    protected $signature = 'demo:snapshot {name=current : snapshot filename (without .json)}';
    protected $description = 'Save current content state to backend/database/demo-snapshots/{name}.json';

    public function handle(): int
    {
        $dir = base_path('database/demo-snapshots');
        File::ensureDirectoryExists($dir);
        $name = (string) $this->argument('name');
        $path = $dir . '/' . $name . '.json';

        // Build uid / code lookups so we can reference accounts by
        // their natural keys instead of brittle auto-increment IDs.
        $uidById = DB::table('users')->pluck('uid', 'id')->all();
        $whitelistCodeById = DB::table('whitelists')->pluck('code', 'id')->all();
        $channelNameById = DB::table('broadcast_channels')->pluck('name', 'id')->all();
        $inboxNameById = DB::table('inboxes')->pluck('name', 'id')->all();

        $snapshot = [
            'meta' => [
                'created_at' => now()->toIso8601String(),
                'app_url'    => config('app.url'),
            ],

            // users.settings (per-user JSONB blob)
            'user_settings' => DB::table('users')
                ->whereNotNull('settings')
                ->get(['uid', 'settings'])
                ->map(fn ($r) => [
                    'uid'      => $r->uid,
                    'settings' => json_decode($r->settings, true),
                ])
                ->values()
                ->all(),

            // Notebooks (BB)
            'blackboards' => DB::table('blackboards')
                ->orderBy('user_id')->orderBy('branch_id')->orderBy('timestamp')
                ->get()
                ->map(fn ($r) => [
                    'uid'         => $uidById[$r->user_id] ?? null,
                    'branch_id'   => $r->branch_id,
                    'branch_name' => $r->branch_name,
                    'timestamp'   => (int) $r->timestamp,
                    'text'        => $r->text,
                    'file_hash'   => $r->file_hash,
                    'owner'       => $r->owner ?? null,
                ])
                ->filter(fn ($r) => $r['uid'] !== null)
                ->values()
                ->all(),

            // Chat connections (bidirectional pairs)
            'walkie_typie_connections' => DB::table('walkie_typie_connections')
                ->get()
                ->map(fn ($r) => [
                    'uid'              => $uidById[$r->user_id] ?? null,
                    'partner_uid'      => $uidById[$r->partner_id] ?? null,
                    'partner_tag'      => $r->partner_tag,
                    'my_branch_id'     => $r->my_branch_id,
                    'partner_branch_id'=> $r->partner_branch_id,
                    'last_signal'      => (int) $r->last_signal,
                ])
                ->filter(fn ($r) => $r['uid'] !== null && $r['partner_uid'] !== null)
                ->values()
                ->all(),

            // Chat board records
            'walkie_typie_boards' => DB::table('walkie_typie_boards')
                ->orderBy('user_id')->orderBy('branch_id')->orderBy('timestamp')
                ->get()
                ->map(fn ($r) => [
                    'uid'         => $uidById[$r->user_id] ?? null,
                    'branch_id'   => $r->branch_id,
                    'branch_name' => $r->branch_name,
                    'timestamp'   => (int) $r->timestamp,
                    'text'        => $r->text,
                    'file_hash'   => $r->file_hash,
                ])
                ->filter(fn ($r) => $r['uid'] !== null)
                ->values()
                ->all(),

            // Broadcast channels (with calendar + flashcards JSONB and whitelist code)
            'broadcast_channels' => DB::table('broadcast_channels')
                ->orderBy('id')
                ->get()
                ->map(fn ($r) => [
                    'name'           => $r->name,
                    'owner_uid'      => $uidById[$r->user_id] ?? null,
                    'last_signal'    => (int) $r->last_signal,
                    'calendar'       => $r->calendar ? json_decode($r->calendar, true) : null,
                    'flashcards'     => $r->flashcards ? json_decode($r->flashcards, true) : null,
                    'whitelist_code' => $whitelistCodeById[$r->whitelist_id] ?? null,
                ])
                ->filter(fn ($r) => $r['owner_uid'] !== null)
                ->values()
                ->all(),

            // Broadcast records (per channel)
            'broadcast_boards' => DB::table('broadcast_boards')
                ->orderBy('channel_id')->orderBy('timestamp')
                ->get()
                ->map(fn ($r) => [
                    'channel_name' => $channelNameById[$r->channel_id] ?? null,
                    'timestamp'    => (int) $r->timestamp,
                    'text'         => $r->text,
                    'file_hash'    => $r->file_hash,
                ])
                ->filter(fn ($r) => $r['channel_name'] !== null)
                ->values()
                ->all(),

            // Subscriptions (pins)
            'broadcast_pins' => DB::table('broadcast_pins')
                ->get()
                ->map(fn ($r) => [
                    'uid'          => $uidById[$r->user_id] ?? null,
                    'channel_name' => $channelNameById[$r->channel_id] ?? null,
                ])
                ->filter(fn ($r) => $r['uid'] !== null && $r['channel_name'] !== null)
                ->values()
                ->all(),

            // Inboxes
            'inboxes' => DB::table('inboxes')
                ->orderBy('id')
                ->get()
                ->map(fn ($r) => [
                    'name'           => $r->name,
                    'description'    => $r->description,
                    'owner_uid'      => $uidById[$r->user_id] ?? null,
                    'last_signal'    => (int) $r->last_signal,
                    'whitelist_code' => $whitelistCodeById[$r->whitelist_id] ?? null,
                ])
                ->filter(fn ($r) => $r['owner_uid'] !== null)
                ->values()
                ->all(),

            // Submissions (per inbox per sender)
            'inbox_submissions' => DB::table('inbox_submissions')
                ->orderBy('inbox_id')->orderBy('user_id')
                ->get()
                ->map(fn ($r) => [
                    'inbox_name'    => $inboxNameById[$r->inbox_id] ?? null,
                    'sender_uid'    => $uidById[$r->user_id] ?? null,
                    'sender_text'   => $r->sender_text,
                    'file_hash'     => $r->file_hash,
                    'receiver_text' => $r->receiver_text,
                    'feedback_at'   => $r->feedback_at !== null ? (int) $r->feedback_at : null,
                ])
                ->filter(fn ($r) => $r['inbox_name'] !== null && $r['sender_uid'] !== null)
                ->values()
                ->all(),
        ];

        File::put($path, json_encode($snapshot, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        $this->info("Snapshot written: {$path}");
        $sizes = [
            'user_settings'             => count($snapshot['user_settings']),
            'blackboards'               => count($snapshot['blackboards']),
            'walkie_typie_connections'  => count($snapshot['walkie_typie_connections']),
            'walkie_typie_boards'       => count($snapshot['walkie_typie_boards']),
            'broadcast_channels'        => count($snapshot['broadcast_channels']),
            'broadcast_boards'          => count($snapshot['broadcast_boards']),
            'broadcast_pins'            => count($snapshot['broadcast_pins']),
            'inboxes'                   => count($snapshot['inboxes']),
            'inbox_submissions'         => count($snapshot['inbox_submissions']),
        ];
        foreach ($sizes as $k => $n) {
            $this->line(sprintf('  %-28s %d row(s)', $k, $n));
        }
        return self::SUCCESS;
    }
}
