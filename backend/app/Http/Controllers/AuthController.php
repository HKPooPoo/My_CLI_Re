<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use App\Mail\ResetPasscodeMail;
use App\Mail\BindEmailMail;

class AuthController extends Controller
{
    /**
     * 註冊功能
     */
    public function register(Request $request)
    {
        $request->validate([
            'uid' => 'required|alpha_dash|unique:users|max:32',
            'passcode' => 'required|string|regex:/^[a-zA-Z0-9!@#$%^&*]{4,32}$/',
        ], [
            'passcode.regex' => 'PASSCODE MUST BE 4-32 CHARS AND CONTAINS NO SPACES.'
        ]);

        try {
            $user = User::create([
                'uid' => $request->uid,
                'passcode' => Hash::make($request->passcode),
            ]);

            return response()->json([
                'message' => 'REGISTRATION SUCCESSFUL',
                'user' => $user
            ], 201);
        } catch (\Exception $e) {
            Log::error('Register Error: ' . $e->getMessage());
            return response()->json(['message' => 'SERVER ERROR', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * 登入功能
     */
    public function login(Request $request)
    {
        $request->validate([
            'uid' => 'required',
            'passcode' => 'required',
        ]);

        try {
            $user = User::where('uid', $request->uid)->first();

            if (!$user || !Hash::check($request->passcode, $user->passcode)) {
                return response()->json(['message' => 'INVALID UID OR PASSCODE'], 401);
            }

            Auth::login($user);

            return response()->json([
                'message' => 'LOGIN SUCCESSFUL',
                'user' => [
                    'uid' => $user->uid
                ]
            ]);
        } catch (\Exception $e) {
            Log::error('Login Error: ' . $e->getMessage());
            return response()->json(['message' => 'SERVER ERROR', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * 登出功能
     */
    public function logout()
    {
        Auth::logout();
        return response()->json(['message' => 'LOGGED OUT']);
    }

    /**
     * 獲取當前狀態
     */
    public function status()
    {
        if (Auth::check()) {
            $user = Auth::user();
            return response()->json([
                'isLoggedIn' => true,
                'uid' => $user->uid,
                'email' => $user->email // 回傳已綁定的 Email
            ]);
        }
        return response()->json(['isLoggedIn' => false]);
    }

    /**
     * 請求重設密碼：發送 /passwd 指令郵件
     */
    public function requestPasswordReset(Request $request)
    {
        try {
            $uid = $request->input('uid');
            $user = User::where('uid', $uid)->first();

            if (!$user || !$user->email) {
                return response()->json(['message' => 'UID NOT FOUND OR EMAIL NOT BOUND.'], 404);
            }

            $token = rand(1000, 9999);
            Cache::put("reset_{$token}", $user->uid, now()->addMinutes(10));

            $command = "/passwd --token {$token} --new YOUR_NEW_PASSCODE";
            Mail::to($user->email)->send(new ResetPasscodeMail($user->uid, $command));

            return response()->json(['message' => 'RESTORE COMMAND SENT TO REGISTERED EMAIL.']);
        } catch (\Exception $e) {
            Log::error('Request Reset Error: ' . $e->getMessage());
            return response()->json(['message' => 'MAIL SYSTEM ERROR.'], 500);
        }
    }

    /**
     * 請求綁定郵件：發送 /bind 指令郵件
     */
    public function requestEmailBinding(Request $request)
    {
        $request->validate([
            'email' => 'required|email|max:255'
        ]);

        try {
            $user = Auth::user();
            $email = $request->input('email');

            if (!$user)
                return response()->json(['message' => 'AUTH REQUIRED.'], 401);

            $token = rand(1000, 9999);
            // 僅快取 Token 與 UID 的授權關係
            Cache::put("bind_token_{$token}", $user->uid, now()->addMinutes(10));

            $command = "/bind --token {$token} --email {$email}";
            Mail::to($email)->send(new BindEmailMail($command));

            return response()->json(['message' => 'VERIFICATION COMMAND SENT.']);
        } catch (\Exception $e) {
            Log::error('Request Bind Error: ' . $e->getMessage());
            return response()->json(['message' => 'MAIL SYSTEM ERROR OR INVALID EMAIL.'], 500);
        }
    }

    /**
     * 指令執行引擎 (方案 B 解析)
     */
    public function executeCommand(Request $request)
    {
        try {
            $input = $request->input('command');

            // 1. /passwd --token 1234 --new password (改為 \S+ 防止包含空格)
            if (preg_match('/^\/passwd --token (\w+) --new (\S+)$/', $input, $matches)) {
                $token = $matches[1];
                $newPass = $matches[2];

                // 檢查新密碼是否符合格式 (雖然是指令執行，但仍需二度驗證安全性)
                if (!preg_match('/^[a-zA-Z0-9!@#$%^&*]{8,32}$/', $newPass)) {
                    return response()->json(['message' => 'PASSWORD FORMAT INVALID. NO SPACES ALLOWED.'], 400);
                }

                $uid = Cache::get("reset_{$token}");
                if (!$uid)
                    return response()->json(['message' => 'INVALID OR EXPIRED TOKEN.'], 400);

                $user = User::where('uid', $uid)->first();
                $user->passcode = Hash::make($newPass);
                $user->save();

                Cache::forget("reset_{$token}");
                return response()->json(['message' => 'PASSCODE UPDATED SUCCESSFULLY.']);
            }

            // 2. /bind --token 1234 --email test@example.com (改為 \S+ 確保 email 解析正確)
            if (preg_match('/^\/bind --token (\w+) --email (\S+)$/', $input, $matches)) {
                $user = Auth::user();
                if (!$user)
                    return response()->json(['message' => 'LOGIN REQUIRED.'], 401);

                $token = $matches[1];
                $email = $matches[2];

                // 二度驗證 Email 格式
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    return response()->json(['message' => 'INVALID EMAIL FORMAT.'], 400);
                }

                $tokenUid = Cache::get("bind_token_{$token}");
                if (!$tokenUid || $tokenUid !== $user->uid) {
                    return response()->json(['message' => 'INVALID OR EXPIRED TOKEN.'], 400);
                }

                $user->email = $email;
                $user->save();

                Cache::forget("bind_token_{$token}");
                return response()->json(['message' => 'EMAIL BOUND SUCCESSFULLY.']);
            }

            return response()->json(['message' => 'SYNTAX ERROR: UNKNOWN COMMAND.'], 400);
        } catch (\Exception $e) {
            Log::error('Execute Command Error: ' . $e->getMessage());
            return response()->json(['message' => 'EXECUTION ERROR.'], 500);
        }
    }
}
