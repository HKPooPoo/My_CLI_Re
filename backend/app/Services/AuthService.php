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

        $token = Str::random(32);
        Cache::put("reset_{$user->uid}_{$token}", $user->uid, now()->addMinutes(10));

        $command = "/passwd --token {$token} --new YOUR_NEW_PASSCODE";
        Mail::to($user->email)->send(new ResetPasscodeMail($user->uid, $command));
    }

    public function requestEmailBinding(string $email, User $user)
    {
        $token = Str::random(32);
        Cache::put("bind_{$user->uid}_{$token}", $user->uid, now()->addMinutes(10));

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

            // Try all users to find the matching scoped cache key
            $uid = null;
            $cacheKey = null;
            $users = User::all();
            foreach ($users as $u) {
                $key = "reset_{$u->uid}_{$token}";
                if (Cache::get($key) === $u->uid) {
                    $uid = $u->uid;
                    $cacheKey = $key;
                    break;
                }
            }

            if (!$uid) {
                throw new \Exception('INVALID OR EXPIRED TOKEN.');
            }

            $userToUpdate = User::where('uid', $uid)->first();
            $userToUpdate->passcode = Hash::make($newPass);
            $userToUpdate->save();

            Cache::forget($cacheKey);
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

            $cacheKey = "bind_{$user->uid}_{$token}";
            $tokenUid = Cache::get($cacheKey);
            if (!$tokenUid || $tokenUid !== $user->uid) {
                throw new \Exception('INVALID OR EXPIRED TOKEN.');
            }

            $user->email = $email;
            $user->save();

            Cache::forget($cacheKey);
            return 'EMAIL BOUND SUCCESSFULLY.';
        }

        throw new \Exception('SYNTAX ERROR: UNKNOWN COMMAND.');
    }
}
