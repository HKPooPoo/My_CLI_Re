<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Events\BroadcastChannelUpdated;
use App\Models\User;
use App\Services\FileService;

class BroadcastChannelService
{
    protected FileService $fileService;

    public function __construct(FileService $fileService)
    {
        $this->fileService = $fileService;
    }

    /**
     * List all public channels, ordered by: pinned first, then last_signal DESC.
     */
    public function listChannels(?User $user): array
    {
        $channels = Cache::remember('bc:channels:base', 30, fn() =>
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
            ? Cache::remember("bc:pins:{$user->id}", 120, fn() =>
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
     */
    public function cast(User $user, string $channelName, array $records): object
    {
        if (!$user->title) {
            abort(403, 'TITLE REQUIRED');
        }

        $channel = DB::transaction(function () use ($user, $channelName, $records) {
            $nowMs = (int) (microtime(true) * 1000);

            $channel = DB::table('broadcast_channels')
                ->where('name', $channelName)
                ->first();

            if (!$channel) {
                $channelId = DB::table('broadcast_channels')->insertGetId([
                    'name'        => $channelName,
                    'user_id'     => $user->id,
                    'last_signal' => $nowMs,
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
                    ->update(['last_signal' => $nowMs, 'updated_at' => now()]);
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
     * Fetch board records for a channel.
     */
    public function fetchBoards(int $channelId): array
    {
        return Cache::remember("bc:boards:{$channelId}", 30, function () use ($channelId) {
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
     * Pin a channel for a user.
     */
    public function pin(User $user, int $channelId): void
    {
        $exists = DB::table('broadcast_channels')->where('id', $channelId)->exists();
        if (!$exists) {
            abort(404, 'CHANNEL NOT FOUND');
        }

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
}
