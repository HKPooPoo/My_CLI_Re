<?php

namespace App\Http\Controllers;

use App\Services\BroadcastChannelService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BroadcastChannelController extends Controller
{
    protected BroadcastChannelService $service;

    public function __construct(BroadcastChannelService $service)
    {
        $this->service = $service;
    }

    /**
     * GET /api/broadcast/channels
     * Public — returns all channels, with is_pinned flag if logged in.
     */
    public function index()
    {
        $user = Auth::user(); // null if not logged in (no auth middleware)
        $channels = $this->service->listChannels($user);
        return response()->json(['channels' => $channels]);
    }

    /**
     * POST /api/broadcast/channels/cast
     * Cast (create/update) a channel. Requires title.
     */
    public function cast(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $request->validate([
            'channelName' => 'required|string|max:255',
            'records'     => 'required|array',
        ]);

        $channel = $this->service->cast(
            $user,
            $request->input('channelName'),
            $request->input('records')
        );

        return response()->json(['message' => 'CAST COMPLETE', 'channel' => $channel]);
    }

    /**
     * PATCH /api/broadcast/channels/{channelId}
     * Rename a channel. Requires title + ownership.
     */
    public function rename(Request $request, $channelId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $this->service->rename($user, (int) $channelId, $request->input('name'));

        return response()->json(['message' => 'RENAME COMPLETE']);
    }

    /**
     * DELETE /api/broadcast/channels/{channelId}
     * Delete a channel and all associated data. Requires title + ownership.
     */
    public function destroy($channelId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $this->service->destroy($user, (int) $channelId);

        return response()->json(['message' => 'DELETE COMPLETE']);
    }

    /**
     * GET /api/broadcast/channels/{channelId}/boards
     * Public — no auth required. Returns board records in creation order (ASC).
     */
    public function fetchBoards($channelId)
    {
        $records = $this->service->fetchBoards((int) $channelId);
        return response()->json(['records' => $records]);
    }

    /**
     * POST /api/broadcast/channels/{channelId}/pin
     * Pin a channel. Requires any logged-in user.
     */
    public function pin($channelId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $this->service->pin($user, (int) $channelId);

        return response()->json(['message' => 'PINNED']);
    }

    /**
     * DELETE /api/broadcast/channels/{channelId}/pin
     * Unpin a channel.
     */
    public function unpin($channelId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $this->service->unpin($user, (int) $channelId);

        return response()->json(['message' => 'UNPINNED']);
    }
}
