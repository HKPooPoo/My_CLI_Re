<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

/**
 * Replay a `demo:snapshot` JSON dump on top of the current accounts.
 * Resolves natural keys (uid, whitelist code, channel name, inbox
 * name) to ids via lookup. Wipes content tables first so re-runs are
 * clean — same convention as `BroadcastChannelService::cast` (replace,
 * not merge).
 */
class DemoRestore extends Command
{
    protected $signature = 'demo:restore {name=current : snapshot filename (without .json)}';
    protected $description = 'Replay a demo:snapshot JSON; wipes content first then re-inserts';

    public function handle(): int
    {
        $name = (string) $this->argument('name');
        $path = base_path('database/demo-snapshots/' . $name . '.json');
        if (!File::exists($path)) {
            $this->error("Snapshot not found: {$path}");
            return self::FAILURE;
        }
        $snapshot = json_decode(File::get($path), true);
        if (!is_array($snapshot)) {
            $this->error('Snapshot file is malformed JSON.');
            return self::FAILURE;
        }

        // Resolve uid / code → id once for the whole replay.
        $idByUid = DB::table('users')->pluck('id', 'uid')->all();
        $whitelistIdByCode = DB::table('whitelists')->pluck('id', 'code')->all();

        DB::transaction(function () use ($snapshot, $idByUid, $whitelistIdByCode) {
            // Wipe content (mirror demo:wipe) so the replay is idempotent.
            DB::table('inbox_submissions')->delete();
            DB::table('inboxes')->delete();
            DB::table('broadcast_pins')->delete();
            DB::table('broadcast_boards')->delete();
            DB::table('broadcast_channels')->delete();
            DB::table('walkie_typie_boards')->delete();
            DB::table('walkie_typie_connections')->delete();
            DB::table('blackboards')->delete();
            DB::table('users')->update(['settings' => null]);

            // ── users.settings ──
            foreach ($snapshot['user_settings'] ?? [] as $row) {
                $uid = $row['uid'] ?? null;
                if (!isset($idByUid[$uid])) continue;
                DB::table('users')->where('id', $idByUid[$uid])->update([
                    'settings'   => json_encode($row['settings'] ?? null, JSON_UNESCAPED_UNICODE),
                    'updated_at' => now(),
                ]);
            }

            // ── blackboards ──
            $bb = [];
            foreach ($snapshot['blackboards'] ?? [] as $row) {
                if (!isset($idByUid[$row['uid']])) continue;
                $bb[] = [
                    'user_id'     => $idByUid[$row['uid']],
                    'branch_id'   => $row['branch_id'],
                    'branch_name' => $row['branch_name'],
                    'timestamp'   => $row['timestamp'],
                    'text'        => $row['text'],
                    'file_hash'   => $row['file_hash'],
                    'owner'       => $row['owner'] ?? 'local',
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ];
            }
            if ($bb) DB::table('blackboards')->insert($bb);

            // ── walkie_typie_connections ──
            $wtConn = [];
            foreach ($snapshot['walkie_typie_connections'] ?? [] as $row) {
                if (!isset($idByUid[$row['uid']]) || !isset($idByUid[$row['partner_uid']])) continue;
                $wtConn[] = [
                    'user_id'           => $idByUid[$row['uid']],
                    'partner_id'        => $idByUid[$row['partner_uid']],
                    'partner_tag'       => $row['partner_tag'],
                    'my_branch_id'      => $row['my_branch_id'],
                    'partner_branch_id' => $row['partner_branch_id'],
                    'last_signal'       => $row['last_signal'],
                    'created_at'        => now(),
                    'updated_at'        => now(),
                ];
            }
            if ($wtConn) DB::table('walkie_typie_connections')->insert($wtConn);

            // ── walkie_typie_boards ──
            $wtBoards = [];
            foreach ($snapshot['walkie_typie_boards'] ?? [] as $row) {
                if (!isset($idByUid[$row['uid']])) continue;
                $wtBoards[] = [
                    'user_id'     => $idByUid[$row['uid']],
                    'branch_id'   => $row['branch_id'],
                    'branch_name' => $row['branch_name'],
                    'timestamp'   => $row['timestamp'],
                    'text'        => $row['text'],
                    'file_hash'   => $row['file_hash'],
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ];
            }
            if ($wtBoards) DB::table('walkie_typie_boards')->insert($wtBoards);

            // ── broadcast_channels ──
            $channelIdByName = [];
            foreach ($snapshot['broadcast_channels'] ?? [] as $row) {
                if (!isset($idByUid[$row['owner_uid']])) continue;
                $whitelistId = isset($row['whitelist_code']) && isset($whitelistIdByCode[$row['whitelist_code']])
                    ? $whitelistIdByCode[$row['whitelist_code']]
                    : null;
                $channelId = DB::table('broadcast_channels')->insertGetId([
                    'name'         => $row['name'],
                    'user_id'      => $idByUid[$row['owner_uid']],
                    'last_signal'  => $row['last_signal'],
                    'calendar'     => $row['calendar'] !== null ? json_encode($row['calendar'], JSON_UNESCAPED_UNICODE) : null,
                    'flashcards'   => $row['flashcards'] !== null ? json_encode($row['flashcards'], JSON_UNESCAPED_UNICODE) : null,
                    'whitelist_id' => $whitelistId,
                    'created_at'   => now(),
                    'updated_at'   => now(),
                ]);
                $channelIdByName[$row['name']] = $channelId;
            }

            // ── broadcast_boards ──
            $bcBoards = [];
            foreach ($snapshot['broadcast_boards'] ?? [] as $row) {
                $cid = $channelIdByName[$row['channel_name']] ?? null;
                if (!$cid) continue;
                $bcBoards[] = [
                    'channel_id' => $cid,
                    'timestamp'  => $row['timestamp'],
                    'text'       => $row['text'],
                    'file_hash'  => $row['file_hash'],
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }
            if ($bcBoards) DB::table('broadcast_boards')->insert($bcBoards);

            // ── broadcast_pins ──
            $pins = [];
            foreach ($snapshot['broadcast_pins'] ?? [] as $row) {
                $uid = $idByUid[$row['uid']] ?? null;
                $cid = $channelIdByName[$row['channel_name']] ?? null;
                if (!$uid || !$cid) continue;
                $pins[] = [
                    'user_id'    => $uid,
                    'channel_id' => $cid,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }
            if ($pins) DB::table('broadcast_pins')->insert($pins);

            // ── inboxes ──
            $inboxIdByName = [];
            foreach ($snapshot['inboxes'] ?? [] as $row) {
                if (!isset($idByUid[$row['owner_uid']])) continue;
                $whitelistId = isset($row['whitelist_code']) && isset($whitelistIdByCode[$row['whitelist_code']])
                    ? $whitelistIdByCode[$row['whitelist_code']]
                    : null;
                $inboxId = DB::table('inboxes')->insertGetId([
                    'name'         => $row['name'],
                    'description'  => $row['description'],
                    'user_id'      => $idByUid[$row['owner_uid']],
                    'whitelist_id' => $whitelistId,
                    'last_signal'  => $row['last_signal'],
                    'created_at'   => now(),
                    'updated_at'   => now(),
                ]);
                $inboxIdByName[$row['name']] = $inboxId;
            }

            // ── inbox_submissions ──
            $subs = [];
            foreach ($snapshot['inbox_submissions'] ?? [] as $row) {
                $iid = $inboxIdByName[$row['inbox_name']] ?? null;
                $uid = $idByUid[$row['sender_uid']] ?? null;
                if (!$iid || !$uid) continue;
                $subs[] = [
                    'inbox_id'      => $iid,
                    'user_id'       => $uid,
                    'sender_text'   => $row['sender_text'],
                    'file_hash'     => $row['file_hash'],
                    'receiver_text' => $row['receiver_text'],
                    'feedback_at'   => $row['feedback_at'],
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ];
            }
            if ($subs) DB::table('inbox_submissions')->insert($subs);
        });

        $this->info("Restored snapshot: {$path}");
        return self::SUCCESS;
    }
}
