<?php

namespace App\Http\Controllers;

use App\Services\AuthService;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Http\Requests\Auth\ExecuteCommandRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class AuthController extends Controller
{
    protected $authService;

    public function __construct(AuthService $authService)
    {
        $this->authService = $authService;
    }

    public function register(RegisterRequest $request)
    {
        try {
            $user = $this->authService->register($request->validated());
            return response()->json([
                'message' => 'REGISTRATION SUCCESSFUL',
                'user' => $user
            ], 201);
        } catch (\Exception $e) {
            Log::error('Register Error: ' . $e->getMessage());
            return response()->json(['message' => 'SERVER ERROR', 'error' => $e->getMessage()], 500);
        }
    }

    public function login(LoginRequest $request)
    {
        try {
            $user = $this->authService->login($request->uid, $request->passcode);

            if (!$user) {
                return response()->json(['message' => 'INVALID UID OR PASSCODE'], 401);
            }

            return response()->json([
                'message' => 'LOGIN SUCCESSFUL',
                'user' => ['uid' => $user->uid, 'title' => $user->title]
            ]);
        } catch (\Exception $e) {
            Log::error('Login Error: ' . $e->getMessage());
            return response()->json(['message' => 'SERVER ERROR', 'error' => $e->getMessage()], 500);
        }
    }

    public function logout(Request $request)
    {
        // Auth::logout() on its own just unsets the user reference from the
        // session payload — the session itself survives with the same ID and
        // cookie. That matters for multi-tab: Tab1 logs in, Tab2 opens and
        // inherits the cookie, Tab2 clicks logout → without invalidate() the
        // shared session lingers and Tab1's next request still walks into a
        // session that happens to be empty but could be re-filled by any
        // subsequent login in Tab2. Explicit invalidate + regenerateToken
        // destroys the session row in Redis and forces a fresh CSRF token.
        Auth::logout();
        // Session middleware only attaches on stateful requests (Sanctum's
        // EnsureFrontendRequestsAreStateful gates this on matching the
        // SANCTUM_STATEFUL_DOMAINS origin list). Real browser requests from
        // the SPA always qualify; test suite's postJson does not, so guard
        // with hasSession() instead of crashing the whole response.
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
        return response()->json(['message' => 'LOGGED OUT']);
    }

    public function status()
    {
        if (Auth::check()) {
            $user = Auth::user();
            return response()->json([
                'is_logged_in' => true,
                'uid' => $user->uid,
                'title' => $user->title,
                'email' => $user->email
            ]);
        }
        return response()->json(['is_logged_in' => false]);
    }

    public function requestPasswordReset(ResetPasswordRequest $request)
    {
        try {
            $this->authService->requestPasswordReset($request->uid);
            return response()->json(['message' => 'RESTORE COMMAND SENT TO REGISTERED EMAIL.']);
        } catch (\Exception $e) {
            Log::error('Request Reset Error: ' . $e->getMessage());
            return response()->json(['message' => $e->getMessage()], 400); // 400 bad request for user error
        }
    }

    public function requestEmailBinding(Request $request)
    {
        $request->validate(['email' => 'required|email|max:255']);

        try {
            $user = Auth::user();
            if (!$user)
                return response()->json(['message' => 'AUTH REQUIRED.'], 401);

            $this->authService->requestEmailBinding($request->email, $user);
            return response()->json(['message' => 'VERIFICATION COMMAND SENT.']);
        } catch (\Exception $e) {
            Log::error('Request Bind Error: ' . $e->getMessage());
            return response()->json(['message' => 'MAIL SYSTEM ERROR.'], 500);
        }
    }

    public function executeCommand(ExecuteCommandRequest $request)
    {
        try {
            $user = Auth::user(); // Can be null for password reset
            $message = $this->authService->executeCommand($request->command, $user);
            return response()->json(['message' => $message]);
        } catch (\Exception $e) {
            Log::error('Execute Command Error: ' . $e->getMessage());
            return response()->json(['message' => $e->getMessage()], 400);
        }
    }

    /**
     * Remove the email binding from the currently-logged-in user.
     * Passcode must be re-entered in the request body as the confirmation
     * gate — owning a live session alone is not enough to unbind.
     */
    public function unbindEmail(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'AUTH REQUIRED.'], 401);
        }

        $request->validate(['passcode' => 'required|string']);

        if (!Hash::check($request->input('passcode'), $user->passcode)) {
            return response()->json(['message' => 'INVALID PASSCODE.'], 401);
        }

        if (!$user->email) {
            return response()->json(['message' => 'NO EMAIL TO UNBIND.'], 400);
        }

        $user->email = null;
        $user->save();

        // A pending /bind token would now resolve to an email that nobody
        // is waiting for — forget it so the stale command from the inbox
        // can't be pasted to silently re-bind after an unbind.
        Cache::forget("bind_current_{$user->uid}");

        return response()->json(['message' => 'EMAIL UNBOUND.']);
    }

    /**
     * Permanently delete the currently-logged-in user and everything the
     * DB cascades from there (BB branches, WT connections + boards, BC
     * channels + boards + pins). Passcode re-entry is the gate; session
     * alone is not enough.
     *
     * Files owned by this user have user_id set to NULL (nullOnDelete),
     * become unreferenced once the cascades above wipe BB/WT/BC records,
     * and get picked up by the hourly orphan-cleanup cron for removal
     * from disk within 24 hours.
     */
    public function deleteAccount(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'AUTH REQUIRED.'], 401);
        }

        $request->validate(['passcode' => 'required|string']);

        if (!Hash::check($request->input('passcode'), $user->passcode)) {
            return response()->json(['message' => 'INVALID PASSCODE.'], 401);
        }

        $uid = $user->uid;

        // Clean any pending auth tokens in cache so they don't outlive
        // the account row.
        $resetToken = Cache::pull("reset_current_{$uid}");
        if ($resetToken) {
            Cache::forget("reset_token:{$resetToken}");
        }
        Cache::forget("bind_current_{$uid}");

        Auth::logout();
        $user->delete();  // triggers DB FK cascades

        return response()->json(['message' => 'ACCOUNT DELETED.']);
    }
}
