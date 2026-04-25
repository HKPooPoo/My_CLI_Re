<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Events\BroadcastChannelUpdated;
use App\Models\User;
use App\Services\FileService;
use App\Services\WhitelistService;

class BroadcastChannelService
{
    protected FileService $fileService;
    protected WhitelistService $whitelistService;

    public function __construct(FileService $fileService, WhitelistService $whitelistService)
    {
        $this->fileService = $fileService;
        $this->whitelistService = $whitelistService;
    }

    /**
     * Visibility gate. Owner always sees. Otherwise the viewer must
     * be a member of the channel's whitelist preset. **No whitelist
     * = closed** — the channel is invisible to non-owners until the
     * owner explicitly applies a preset. Aborts 403 on miss (channel
     * ids are not secrets so existence-leak is acceptable).
     */
    private function assertVisibleTo(object $channel, ?User $user): void
    {
        if ($user && (int) $user->id === (int) $channel->user_id) return;
        if (!empty($channel->whitelist_id) && $user
            && $this->whitelistService->isMember((int) $channel->whitelist_id, $user->uid)) return;
        abort(403, 'CHANNEL NOT AVAILABLE');
    }

    public function isVisibleTo(object $channel, ?User $user): bool
    {
        if ($user && (int) $user->id === (int) $channel->user_id) return true;
        return !empty($channel->whitelist_id) && $user
            && $this->whitelistService->isMember((int) $channel->whitelist_id, $user->uid);
    }

    /**
     * List all public channels, ordered by: pinned first, then last_signal DESC.
     */
    public function listChannels(?User $user): array
    {
        $channels = Cache::remember('bc:channels:base', config('timing.backend.cacheTTL.bcChannelsBase'), fn() =>
            DB::table('broadcast_channels')
                ->leftJoin('users', 'broadcast_channels.user_id', '=', 'users.id')
                ->orderBy('broadcast_channels.last_signal', 'desc')
                ->select(
                    'broadcast_channels.*',
                    'users.uid as owner_uid',
                    'users.title as owner_title'
                )
                ->get()
        );

        $pinnedIds = $user
            ? Cache::remember("bc:pins:{$user->id}", config('timing.backend.cacheTTL.bcPins'), fn() =>
                DB::table('broadcast_pins')
                    ->where('user_id', $user->id)
                    ->pluck('channel_id')->flip()->toArray()
              )
            : [];

        $result = $channels->map(function ($ch) use ($pinnedIds) {
            $ch = (array) $ch;
            $ch['is_pinned'] = isset($pinnedIds[$ch['id']]);
            return $ch;
        })->toArray();

        $result = array_values(array_filter($result, function ($ch) use ($user) {
            // Owner sees their own channel regardless of whitelist state.
            if ($user && (int) $user->id === (int) $ch['user_id']) return true;
            // Non-owners require an applied whitelist they're in.
            // No whitelist = closed (the absence of a preset means the
            // owner hasn't explicitly opened the channel to anyone yet).
            return !empty($ch['whitelist_id']) && $user
                && $this->whitelistService->isMember((int) $ch['whitelist_id'], $user->uid);
        }));

        usort($result, function ($a, $b) {
            if ($a['is_pinned'] !== $b['is_pinned']) {
                return $a['is_pinned'] ? -1 : 1;
            }
            return $b['last_signal'] <=> $a['last_signal'];
        });

        return $result;
    }

    /**
     * Cast (publish) a channel to the server.
     *
     * `calendar` and `flashcards` are optional; when provided each is
     * persisted to its own JSONB column in the same transaction as
     * records. This keeps both on the same manual-sync cadence as
     * text + files — no live per-edit writes.
     */
    public function cast(User $user, string $channelName, array $records, ?array $calendar = null, ?array $flashcards = null): object
    {
        if (!$user->title) {
            abort(403, 'TITLE REQUIRED');
        }

        $channel = DB::transaction(function () use ($user, $channelName, $records, $calendar, $flashcards) {
            $nowMs = (int) (microtime(true) * 1000);

            $channel = DB::table('broadcast_channels')
                ->where('name', $channelName)
                ->first();

            $channelUpdateFields = ['last_signal' => $nowMs, 'updated_at' => now()];
            if ($calendar !== null) {
                $channelUpdateFields['calendar'] = json_encode($calendar);
            }
            if ($flashcards !== null) {
                $channelUpdateFields['flashcards'] = json_encode($flashcards);
            }

            if (!$channel) {
                $channelId = DB::table('broadcast_channels')->insertGetId([
                    'name'        => $channelName,
                    'user_id'     => $user->id,
                    'last_signal' => $nowMs,
                    'calendar'    => $calendar !== null ? json_encode($calendar) : null,
                    'flashcards'  => $flashcards !== null ? json_encode($flashcards) : null,
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ]);
            } else {
                if ($channel->user_id !== $user->id) {
                    abort(403, 'NOT CHANNEL OWNER');
                }
                $channelId = $channel->id;
                DB::table('broadcast_channels')
                    ->where('id', $channelId)
                    ->update($channelUpdateFields);
            }

            DB::table('broadcast_boards')
                ->where('channel_id', $channelId)
                ->delete();

            $insertData = [];
            $fileHashes = [];

            foreach ($records as $record) {
                $text = $record['text'] ?? '';
                if (trim($text) === '' && empty($record['file_hash'])) {
                    continue;
                }

                [$fileHash, $hashes] = FileService::normalizeFileHash($record['file_hash'] ?? null);
                $fileHashes = array_merge($fileHashes, $hashes);

                $insertData[] = [
                    'channel_id'  => $channelId,
                    'timestamp'   => $record['timestamp'],
                    'text'        => $text,
                    'file_hash'   => $fileHash,
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ];
            }

            if (!empty($insertData)) {
                DB::table('broadcast_boards')->insert($insertData);
            }

            $this->fileService->markCommittedBatch($fileHashes);

            return DB::table('broadcast_channels')->where('id', $channelId)->first();
        });

        Cache::forget('bc:channels:base');
        Cache::forget("bc:boards:{$channel->id}");

        // Look up owner uid for broadcast event
        $ownerUid = DB::table('users')->where('id', $channel->user_id)->value('uid');

        broadcast(new BroadcastChannelUpdated(
            (int) $channel->id, $channel->name, $ownerUid,
            (int) $channel->last_signal, 'cast'
        ));

        return $channel;
    }

    /**
     * Rename a channel.
     */
    public function rename(User $user, int $channelId, string $newName): void
    {
        if (!$user->title) {
            abort(403, 'TITLE REQUIRED');
        }

        $channel = DB::table('broadcast_channels')->where('id', $channelId)->first();

        if (!$channel) {
            abort(404, 'CHANNEL NOT FOUND');
        }

        if ($channel->user_id !== $user->id) {
            abort(403, 'NOT CHANNEL OWNER');
        }

        $exists = DB::table('broadcast_channels')
            ->where('name', $newName)
            ->where('id', '!=', $channelId)
            ->exists();

        if ($exists) {
            abort(409, 'NAME ALREADY TAKEN');
        }

        DB::table('broadcast_channels')
            ->where('id', $channelId)
            ->update(['name' => $newName, 'updated_at' => now()]);

        Cache::forget('bc:channels:base');
        $updated = DB::table('broadcast_channels')->where('id', $channelId)->first();
        $ownerUid = DB::table('users')->where('id', $updated->user_id)->value('uid');

        broadcast(new BroadcastChannelUpdated(
            $channelId, $newName, $ownerUid,
            (int) $updated->last_signal, 'rename'
        ));
    }

    /**
     * Owner applies (or detaches) a whitelist preset on this
     * channel. `null` reverts the channel to public. Distinct from
     * other owner mutations: even owners can only apply presets
     * they're cleared to use via T1 distribution rules — owning
     * the channel doesn't grant access to arbitrary preset ids.
     */
    public function applyWhitelist(User $user, int $channelId, ?int $whitelistId): void
    {
        if (!$user->title) {
            abort(403, 'TITLE REQUIRED');
        }

        $channel = DB::table('broadcast_channels')->where('id', $channelId)->first();
        if (!$channel) abort(404, 'CHANNEL NOT FOUND');
        if ($channel->user_id !== $user->id) abort(403, 'NOT CHANNEL OWNER');

        if ($whitelistId !== null) {
            $exists = DB::table('whitelists')->where('id', $whitelistId)->exists();
            if (!$exists) abort(404, 'WHITELIST NOT FOUND');
            if (!$this->whitelistService->canUserApply($user, $whitelistId)) {
                abort(403, 'NOT AUTHORISED FOR THIS WHITELIST');
            }
        }

        DB::table('broadcast_channels')
            ->where('id', $channelId)
            ->update([
                'whitelist_id' => $whitelistId,
                'updated_at'   => now(),
            ]);

        Cache::forget('bc:channels:base');
        Cache::forget("bc:boards:{$channelId}");
    }

    /**
     * Delete a channel.
     */
    public function destroy(User $user, int $channelId): void
    {
        if (!$user->title) {
            abort(403, 'TITLE REQUIRED');
        }

        $channel = DB::table('broadcast_channels')->where('id', $channelId)->first();

        if (!$channel) {
            abort(404, 'CHANNEL NOT FOUND');
        }

        if ($channel->user_id !== $user->id) {
            abort(403, 'NOT CHANNEL OWNER');
        }

        $ownerUid = DB::table('users')->where('id', $channel->user_id)->value('uid');

        DB::transaction(function () use ($channelId) {
            DB::table('broadcast_boards')->where('channel_id', $channelId)->delete();
            DB::table('broadcast_pins')->where('channel_id', $channelId)->delete();
            DB::table('broadcast_channels')->where('id', $channelId)->delete();
        });

        Cache::forget('bc:channels:base');
        Cache::forget("bc:boards:{$channelId}");
        broadcast(new BroadcastChannelUpdated(
            $channelId, $channel->name, $ownerUid, 0, 'destroy'
        ));
    }

    /**
     * Fetch board records for a channel. Whitelist-gated: a private
     * channel returns 403 to non-members, 404 to nobody (existence
     * is not a secret). The cached payload itself is identical
     * across viewers, so the visibility check sits in front of the
     * cache rather than inside the cache key.
     */
    public function fetchBoards(int $channelId, ?User $user = null): array
    {
        $channel = DB::table('broadcast_channels')->where('id', $channelId)->first();
        if (!$channel) return [];
        $this->assertVisibleTo($channel, $user);

        return Cache::remember("bc:boards:{$channelId}", config('timing.backend.cacheTTL.bcBoards'), function () use ($channelId) {
            $records = DB::table('broadcast_boards')
                ->where('broadcast_boards.channel_id', $channelId)
                ->orderBy('broadcast_boards.timestamp', 'asc')
                ->select('broadcast_boards.*')
                ->get();

            // Hide file_hash entries whose blob is not currently available, so
            // subscribers do not see chips that would 404 when clicked.
            $allHashes = [];
            foreach ($records as $r) {
                [, $hashes] = FileService::normalizeFileHash($r->file_hash);
                foreach ($hashes as $h) $allHashes[] = $h;
            }
            if (!empty($allHashes)) {
                $available = FileService::buildAvailableHashSet($allHashes);
                foreach ($records as $r) {
                    $r->file_hash = FileService::filterAvailableHashes($r->file_hash, $available);
                }
            }

            return $records->toArray();
        });
    }

    /**
     * Pin a channel for a user. Pin attempts on private channels
     * the user can't see are rejected — leaking existence here
     * would let non-members confirm channel ids by trying to pin.
     */
    public function pin(User $user, int $channelId): void
    {
        $channel = DB::table('broadcast_channels')->where('id', $channelId)->first();
        if (!$channel) {
            abort(404, 'CHANNEL NOT FOUND');
        }
        $this->assertVisibleTo($channel, $user);

        DB::table('broadcast_pins')->upsert(
            [['user_id' => $user->id, 'channel_id' => $channelId, 'created_at' => now(), 'updated_at' => now()]],
            ['user_id', 'channel_id'],
            ['updated_at']
        );
        Cache::forget("bc:pins:{$user->id}");
    }

    /**
     * Unpin a channel for a user.
     */
    public function unpin(User $user, int $channelId): void
    {
        DB::table('broadcast_pins')
            ->where('user_id', $user->id)
            ->where('channel_id', $channelId)
            ->delete();
        Cache::forget("bc:pins:{$user->id}");
    }

    /**
     * Fetch a channel's calendar dict. Public read; returns an empty
     * object when the channel has no calendar or does not exist.
     *
     * Used by subscribers who want a fresh calendar after receiving a
     * broadcast.channel.updated event, without refetching the full
     * channel list. Writes go through cast() — never direct.
     */
    public function getCalendar(int $channelId, ?User $user = null): array
    {
        $channel = DB::table('broadcast_channels')->where('id', $channelId)->first();
        if (!$channel) return [];
        $this->assertVisibleTo($channel, $user);

        $raw = $channel->calendar;
        if (!$raw) return [];
        $decoded = is_array($raw) ? $raw : json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * Fetch a channel's flashcards dict. Public read; returns an empty
     * object when the channel has none or does not exist. Same
     * "cast is the only writer" contract as getCalendar.
     *
     * Shape when populated:
     *   { cards: [{ front, back }, ...], mode, playState: { ... } }
     */
    public function getFlashcards(int $channelId, ?User $user = null): array
    {
        $channel = DB::table('broadcast_channels')->where('id', $channelId)->first();
        if (!$channel) return [];
        $this->assertVisibleTo($channel, $user);

        $raw = $channel->flashcards;
        if (!$raw) return [];
        $decoded = is_array($raw) ? $raw : json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}
