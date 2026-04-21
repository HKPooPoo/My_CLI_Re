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
     */
    public function index()
    {
        $user = Auth::user();
        $channels = $this->service->listChannels($user);
        return response()->json(['channels' => $channels]);
    }

    /**
     * POST /api/broadcast/channels/cast
     */
    public function cast(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $request->validate([
            'channel_name'       => 'required|string|max:255',
            'records'            => 'required|array|max:1000',
            'records.*.text'     => 'nullable|string|max:65535',
            'records.*.timestamp' => 'required|integer',
            'records.*.file_hash' => 'nullable|string|max:65535',
        ]);

        $channel = $this->service->cast(
            $user,
            $request->input('channel_name'),
            $request->input('records')
        );

        return response()->json(['message' => 'CAST COMPLETE', 'channel' => $channel]);
    }

    /**
     * PATCH /api/broadcast/channels/{channelId}
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
     */
    public function fetchBoards($channelId)
    {
        $records = $this->service->fetchBoards((int) $channelId);
        return response()->json(['records' => $records]);
    }

    /**
     * POST /api/broadcast/channels/{channelId}/pin
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

    /**
     * GET /api/broadcast/channels/{channelId}/calendar
     *
     * Public read: any user (including guests) can fetch a channel's
     * calendar dict. Matches the project-wide "guests browse announcements"
     * rule — calendar is part of the channel's public face.
     */
    public function showCalendar($channelId)
    {
        $calendar = $this->service->getCalendar((int) $channelId);
        return response()->json(['calendar' => $calendar]);
    }

    /**
     * PUT /api/broadcast/channels/{channelId}/calendar
     *
     * Auth required; only the channel's creator UID may write
     * (consistent with cast/rename patterns in this project — the
     * title-sharing refinement from the overhaul spec is not yet
     * applied across write operations, see CLAUDE.md handover).
     */
    public function updateCalendar(Request $request, $channelId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'calendar' => 'required|array',
        ]);

        $this->service->updateCalendar($user, (int) $channelId, $validated['calendar']);

        return response()->json(['calendar' => $validated['calendar']]);
    }
}
