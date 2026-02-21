<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Events\BroadcastChannelUpdated;
use App\Models\User;

class BroadcastChannelService
{
    protected FileService $fileService;

    public function __construct(FileService $fileService)
    {
        $this->fileService = $fileService;
    }

    /**
     * List all public channels, ordered by: pinned first, then last_signal DESC.
     * If a user is provided, includes is_pinned flag per channel.
     */
    public function listChannels(?User $user): array
    {
        // Base channel list is user-agnostic — cache 15s
        $channels = Cache::remember('bc:channels:base', 15, fn() =>
            DB::table('broadcast_channels')
                ->leftJoin('users', 'broadcast_channels.owner_uid', '=', 'users.uid')
                ->orderBy('broadcast_channels.last_signal', 'desc')
                ->select('broadcast_channels.*', 'users.title as owner_title')
                ->get()
        );

        // Per-user pin list — cache 120s
        $pinnedIds = $user
            ? Cache::remember("bc:pins:{$user->uid}", 120, fn() =>
                DB::table('broadcast_pins')
                    ->where('user_uid', $user->uid)
                    ->pluck('channel_id')->flip()->toArray()
              )
            : [];

        $result = $channels->map(function ($ch) use ($pinnedIds) {
            $ch = (array) $ch;
            $ch['is_pinned'] = isset($pinnedIds[$ch['id']]);
            return $ch;
        })->toArray();

        // Stable sort: pinned first, then by last_signal DESC (already ordered above)
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
     * Creates the channel if it does not exist, updates it if the user is the owner.
     * BC Last Write Wins: replaces all boards with the incoming records.
     * Returns the channel record.
     */
    public function cast(User $user, string $channelName, array $records): object
    {
        if (!$user->title) {
            abort(403, 'TITLE REQUIRED');
        }

        $channel = DB::transaction(function () use ($user, $channelName, $records) {
            $nowMs = (int) (microtime(true) * 1000);

            // Find or create the channel by name
            $channel = DB::table('broadcast_channels')
                ->where('name', $channelName)
                ->first();

            if (!$channel) {
                // Create new channel
                $channelId = DB::table('broadcast_channels')->insertGetId([
                    'name'        => $channelName,
                    'owner_uid'   => $user->uid,
                    'last_signal' => $nowMs,
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ]);
            } else {
                // Verify ownership
                if ($channel->owner_uid !== $user->uid) {
                    abort(403, 'NOT CHANNEL OWNER');
                }
                $channelId = $channel->id;
                DB::table('broadcast_channels')
                    ->where('id', $channelId)
                    ->update(['last_signal' => $nowMs, 'updated_at' => now()]);
            }

            // Last Write Wins: delete all existing boards, then insert incoming
            DB::table('broadcast_boards')
                ->where('channel_id', $channelId)
                ->delete();

            $insertData = [];
            $fileHashes = [];

            foreach ($records as $record) {
                $text = $record['text'] ?? '';
                if (trim($text) === '' && empty($record['bin'])) {
                    continue;
                }

                $bin = $record['bin'] ?? null;
                if ($bin) {
                    $fileHashes[] = $bin;
                }

                $insertData[] = [
                    'channel_id'  => $channelId,
                    'timestamp'   => $record['timestamp'],
                    'text'        => $text,
                    'bin'         => $bin,
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ];
            }

            if (!empty($insertData)) {
                DB::table('broadcast_boards')->insert($insertData);
            }

            // Mark referenced files as committed
            foreach ($fileHashes as $hash) {
                $this->fileService->markCommitted($hash);
            }

            return DB::table('broadcast_channels')->where('id', $channelId)->first();
        });

        Cache::forget('bc:channels:base');
        Cache::forget("bc:boards:{$channel->id}");
        broadcast(new BroadcastChannelUpdated(
            (int) $channel->id, $channel->name, $channel->owner_uid,
            (int) $channel->last_signal, 'cast'
        ));

        return $channel;
    }

    /**
     * Rename a channel. Owner + title required.
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

        if ($channel->owner_uid !== $user->uid) {
            abort(403, 'NOT CHANNEL OWNER');
        }

        // Check name uniqueness (excluding self)
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
        broadcast(new BroadcastChannelUpdated(
            $channelId, $newName, $updated->owner_uid,
            (int) $updated->last_signal, 'rename'
        ));
    }

    /**
     * Delete a channel and all associated boards and pins. Owner + title required.
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

        if ($channel->owner_uid !== $user->uid) {
            abort(403, 'NOT CHANNEL OWNER');
        }

        DB::transaction(function () use ($channelId) {
            DB::table('broadcast_boards')->where('channel_id', $channelId)->delete();
            DB::table('broadcast_pins')->where('channel_id', $channelId)->delete();
            DB::table('broadcast_channels')->where('id', $channelId)->delete();
        });

        Cache::forget('bc:channels:base');
        Cache::forget("bc:boards:{$channelId}");
        broadcast(new BroadcastChannelUpdated(
            $channelId, $channel->name, $channel->owner_uid, 0, 'destroy'
        ));
    }

    /**
     * Fetch board records for a channel. Public — no auth required.
     * Records ordered by timestamp ASC (creation order, oldest first).
     * The frontend reverses this for Head 0 = newest.
     */
    public function fetchBoards(int $channelId): array
    {
        return Cache::remember("bc:boards:{$channelId}", 30, fn() =>
            DB::table('broadcast_boards')
                ->leftJoin('files', 'broadcast_boards.bin', '=', 'files.hash')
                ->where('broadcast_boards.channel_id', $channelId)
                ->orderBy('broadcast_boards.timestamp', 'asc')
                ->select(
                    'broadcast_boards.*',
                    'files.original_name as file_name',
                    'files.size as file_size',
                    'files.mime_type as file_mime'
                )
                ->get()
                ->toArray()
        );
    }

    /**
     * Pin a channel for a user. Any logged-in user can pin.
     */
    public function pin(User $user, int $channelId): void
    {
        $exists = DB::table('broadcast_channels')->where('id', $channelId)->exists();
        if (!$exists) {
            abort(404, 'CHANNEL NOT FOUND');
        }

        DB::table('broadcast_pins')->upsert(
            [['user_uid' => $user->uid, 'channel_id' => $channelId, 'created_at' => now(), 'updated_at' => now()]],
            ['user_uid', 'channel_id'],
            ['updated_at']
        );
        Cache::forget("bc:pins:{$user->uid}");
    }

    /**
     * Unpin a channel for a user.
     */
    public function unpin(User $user, int $channelId): void
    {
        DB::table('broadcast_pins')
            ->where('user_uid', $user->uid)
            ->where('channel_id', $channelId)
            ->delete();
        Cache::forget("bc:pins:{$user->uid}");
    }
}
