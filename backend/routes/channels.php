<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{uid}', function ($user, $uid) {
    return $user->uid === $uid;
});

Broadcast::channel('walkie-typie.{user1}.{user2}', function ($user, $user1, $user2) {
    return $user->uid === $user1 || $user->uid === $user2;
});
