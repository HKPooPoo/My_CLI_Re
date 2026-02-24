<?php

namespace App\Services;

use App\Models\User;

class SettingsService
{
    public function get(User $user): ?array
    {
        return $user->settings;
    }

    public function save(User $user, array $settings): void
    {
        $user->update(['settings' => $settings]);
    }
}
