<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{uid}', function ($user, $uid) {
    return $user->uid === $uid;
});
