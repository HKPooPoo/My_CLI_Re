<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{uid}', function ($user, $uid) {
    return $user->uid === $uid;
});

Broadcast::channel('walkie-typie.{user1}.{user2}', function ($user, $user1, $user2) {
    return $user->uid === $user1 || $user->uid === $user2;
});

/**
 * NOTE: `broadcast-channel.{channelId}` is intentionally a public
 * channel (no auth callback registered here). The WS payload only
 * carries the channel id + last_signal + action label — no record
 * content, no calendar / flashcards body. The actual read paths
 * (fetchBoards / showCalendar / showFlashcards) are whitelist-
 * gated at the HTTP layer in BroadcastChannelService::assertVisibleTo,
 * so a non-member can hear "channel 17 was updated" but cannot
 * fetch what changed. Channel ids are not secrets (they appear in
 * GET /api/broadcast/channels for owners and members alike), so
 * this leak surface is acceptable for the classroom demo scope.
 */
