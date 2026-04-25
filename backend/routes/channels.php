<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{uid}', function ($user, $uid) {
    return $user->uid === $uid;
});

Broadcast::channel('walkie-typie.{user1}.{user2}', function ($user, $user1, $user2) {
    return $user->uid === $user1 || $user->uid === $user2;
});

/**
 * NOTE: `broadcast-channel.{channelId}` and `inbox.{inboxId}` are
 * intentionally public channels (no auth callback registered). The
 * WS payload only carries id + last_signal + action — no record
 * content, no submission text, no feedback body. Read paths
 * (fetchBoards / fetchSubmissions / getMySubmission) are gated at
 * the HTTP layer (assertVisibleTo / loadOwnedOrAbort), so a non-
 * member can hear "inbox 17 was updated" but cannot fetch what
 * changed. Inbox ids are not secrets — they appear in GET /api/inboxes
 * for any user the inbox is visible to. Acceptable leak surface for
 * the classroom demo scope.
 */
