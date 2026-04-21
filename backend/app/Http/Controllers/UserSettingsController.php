<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * User Settings — per-user cross-device sync for app config + calendar.
 *
 * Stored in the existing `users.settings` JSONB column (already nullable,
 * so no migration). Shape (opinionated, client controls the schema):
 *   {
 *       "app":      { "autoSync": true, "loopList": false, ... },
 *       "calendar": { "2026-04-23": "Logic Test", ... }
 *   }
 *
 * Any authenticated user can GET their own and PUT any JSON object.
 * Last-write-wins — same as every other sync surface in the project.
 */
class UserSettingsController extends Controller
{
    public function show(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        return response()->json([
            'settings' => $user->settings ?? new \stdClass(),
        ]);
    }

    public function update(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $validated = $request->validate([
            'settings' => 'required|array',
        ]);

        $user->settings = $validated['settings'];
        $user->save();

        return response()->json([
            'settings' => $user->settings,
        ]);
    }
}
