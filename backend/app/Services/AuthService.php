<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use App\Mail\ResetPasscodeMail;
use App\Mail\BindEmailMail;

class AuthService
{
    public function register(array $data)
    {
        return User::create([
            'uid' => $data['uid'],
            'passcode' => Hash::make($data['passcode']),
        ]);
    }

    public function login(string $uid, string $passcode)
    {
        $user = User::where('uid', $uid)->first();

        if (!$user || !Hash::check($passcode, $user->passcode)) {
            return null;
        }

        Auth::login($user);
        return $user;
    }

    public function requestPasswordReset(string $uid)
    {
        $user = User::where('uid', $uid)->first();

        if (!$user || !$user->email) {
            throw new \Exception('UID NOT FOUND OR EMAIL NOT BOUND.');
        }

        // Single-token policy: if this uid already has an outstanding reset
        // request, invalidate its token so only the newest email works. Stops
        // the "click 4 times → 4 usable emails × 10-min TTL" attack surface.
        $previousToken = Cache::pull("reset_current_{$user->uid}");
        if ($previousToken) {
            Cache::forget("reset_token:{$previousToken}");
        }

        $token = Str::random(8);
        // Dual key: reset_token:{token} is the lookup path used by /passwd
        // (no login context, so we resolve token → uid there). reset_current
        // gives us the reverse (uid → current token) so we can invalidate
        // the previous token on a re-request.
        Cache::put("reset_current_{$user->uid}", $token, now()->addMinutes(10));
        Cache::put("reset_token:{$token}", $user->uid, now()->addMinutes(10));

        $command = "/passwd --token {$token} --new YOUR_NEW_PASSCODE";
        Mail::to($user->email)->send(new ResetPasscodeMail($user->uid, $command));
    }

    public function requestEmailBinding(string $email, User $user)
    {
        // Single key per uid: Cache::put overwrites, so a rapid 4-click burst
        // leaves only the newest token usable (older emails' tokens silently
        // expire). The cache value also pins the target email so /bind exec
        // can't be tricked into setting a different address than the one
        // the email was actually sent to.
        $token = Str::random(8);
        Cache::put("bind_current_{$user->uid}", [
            'token' => $token,
            'email' => $email,
        ], now()->addMinutes(10));

        $command = "/bind --token {$token} --email {$email}";
        Mail::to($email)->send(new BindEmailMail($command));
    }

    public function executeCommand(string $input, ?User $user)
    {
        // 1. /passwd --token <token> --new password
        if (preg_match('/^\/passwd --token (\w+) --new (\S+)$/', $input, $matches)) {
            $token = $matches[1];
            $newPass = $matches[2];

            if (!preg_match('/^[a-zA-Z0-9!@#$%^&*]{4,32}$/', $newPass)) {
                throw new \Exception('PASSWORD FORMAT INVALID. MUST BE 4-32 CHARS, NO SPACES.');
            }

            $uid = Cache::get("reset_token:{$token}");

            if (!$uid) {
                throw new \Exception('INVALID OR EXPIRED TOKEN.');
            }

            $userToUpdate = User::where('uid', $uid)->first();
            if (!$userToUpdate) {
                throw new \Exception('INVALID OR EXPIRED TOKEN.');
            }

            $userToUpdate->passcode = Hash::make($newPass);
            $userToUpdate->save();

            Cache::forget("reset_token:{$token}");
            Cache::forget("reset_current_{$uid}");
            return 'PASSCODE UPDATED SUCCESSFULLY.';
        }

        // 2. /bind --token <token> --email test@example.com
        if (preg_match('/^\/bind --token (\w+) --email (\S+)$/', $input, $matches)) {
            if (!$user) {
                throw new \Exception('LOGIN REQUIRED.');
            }

            $token = $matches[1];
            $email = $matches[2];

            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new \Exception('INVALID EMAIL FORMAT.');
            }

            $cached = Cache::get("bind_current_{$user->uid}");
            // Three conditions must all line up: the stored token, the
            // stored target email, and the requester's uid (implicit via
            // the key). Any mismatch — wrong token, token from a previous
            // now-invalidated request, or an email that doesn't match the
            // one we actually sent to — bounces with the same generic
            // message so the caller can't distinguish them.
            if (!$cached || $cached['token'] !== $token || $cached['email'] !== $email) {
                throw new \Exception('INVALID OR EXPIRED TOKEN.');
            }

            // Use the cached target email, not the one the user typed into
            // the command. They should match at this point, but reading
            // from cache makes the "what email we actually sent to" the
            // authoritative source.
            $user->email = $cached['email'];
            $user->save();

            Cache::forget("bind_current_{$user->uid}");
            return 'EMAIL BOUND SUCCESSFULLY.';
        }

        throw new \Exception('SYNTAX ERROR: UNKNOWN COMMAND.');
    }
}
