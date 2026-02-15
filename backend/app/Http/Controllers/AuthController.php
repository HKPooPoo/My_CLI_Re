<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    /**
     * 請求重設密碼：發送 /passwd 指令郵件
     */
    public function requestPasswordReset(Request $request)
    {
        $uid = $request->input('uid');
        $user = User::where('uid', $uid)->first();

        if (!$user || !$user->email) {
            return response()->json(['message' => 'UID NOT FOUND OR EMAIL NOT BOUND.'], 404);
        }

        $token = rand(1000, 9999);
        Cache::put("reset_{$token}", $user->uid, now()->addMinutes(10));

        $command = "/passwd --token {$token} --new YOUR_NEW_PASSCODE";

        Mail::raw("SYSTEM RESTORE INITIATED.\n\nExecute the following command in your terminal to reset passcode:\n\n{$command}\n\n(Expires in 10 minutes)", function ($message) use ($user) {
            $message->to($user->email)->subject('[ SECURITY ] PASSCODE RESET COMMAND');
        });

        return response()->json(['message' => 'RESTORE COMMAND SENT TO REGISTERED EMAIL.']);
    }

    /**
     * 請求綁定郵件：發送 /bind 指令郵件
     */
    public function requestEmailBinding(Request $request)
    {
        $user = Auth::user();
        $email = $request->input('email');

        if (!$user || !$email) return response()->json(['message' => 'AUTH REQUIRED.'], 401);

        $token = rand(1000, 9999);
        // 儲存 token 對應的 email，供驗證時寫入資料庫
        Cache::put("bind_{$token}_{$user->uid}", $email, now()->addMinutes(10));

        $command = "/bind --token {$token}";

        Mail::raw("EMAIL BINDING INITIATED.\n\nExecute the following command to verify your email:\n\n{$command}\n\n(Expires in 10 minutes)", function ($message) use ($email) {
            $message->to($email)->subject('[ SYSTEM ] EMAIL BINDING COMMAND');
        });

        return response()->json(['message' => 'VERIFICATION COMMAND SENT.']);
    }

    /**
     * 指令執行引擎 (方案 B 解析)
     */
    public function executeCommand(Request $request)
    {
        $input = $request->input('command');

        // 1. 解析 /passwd --token 1234 --new password
        if (preg_match('/^\/passwd --token (\w+) --new (.+)$/', $input, $matches)) {
            $token = $matches[1];
            $newPass = $matches[2];

            $uid = Cache::get("reset_{$token}");
            if (!$uid) return response()->json(['message' => 'INVALID OR EXPIRED TOKEN.'], 400);

            $user = User::where('uid', $uid)->first();
            $user->passcode = Hash::make($newPass);
            $user->save();

            Cache::forget("reset_{$token}");
            return response()->json(['message' => 'PASSCODE UPDATED SUCCESSFULLY.']);
        }

        // 2. 解析 /bind --token 1234
        if (preg_match('/^\/bind --token (\w+)$/', $input, $matches)) {
            $user = Auth::user();
            if (!$user) return response()->json(['message' => 'LOGIN REQUIRED.'], 401);

            $token = $matches[1];
            $email = Cache::get("bind_{$token}_{$user->uid}");

            if (!$email) return response()->json(['message' => 'INVALID OR EXPIRED TOKEN.'], 400);

            $user->email = $email;
            $user->save();

            Cache::forget("bind_{$token}_{$user->uid}");
            return response()->json(['message' => 'EMAIL BOUND SUCCESSFULLY.']);
        }

        return response()->json(['message' => 'SYNTAX ERROR: UNKNOWN COMMAND.'], 400);
    }
    /**
     * 註冊功能
     */
    public function register(Request $request)
    {
        $request->validate([
            'uid' => 'required|unique:users',
            'passcode' => 'required|min:4',
        ]);

        $user = User::create([
            'uid' => $request->uid,
            'passcode' => Hash::make($request->passcode),
        ]);

        return response()->json([
            'message' => '註冊成功',
            'user' => $user
        ], 201);
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

        $user = User::where('uid', $request->uid)->first();

        // 檢查使用者是否存在且密碼 (passcode) 正確
        if (!$user || !Hash::check($request->passcode, $user->passcode)) {
            return response()->json(['message' => 'UID 或 Passcode 錯誤'], 401);
        }

        // 登入
        Auth::login($user);

        return response()->json([
            'message' => '登入成功',
            'user' => [
                'uid' => $user->uid
            ]
        ]);
    }

    /**
     * 登出功能
     */
    public function logout()
    {
        Auth::logout();
        return response()->json(['message' => '已登出']);
    }

    /**
     * 獲取當前狀態
     */
    public function status()
    {
        if (Auth::check()) {
            return response()->json([
                'isLoggedIn' => true,
                'uid' => Auth::user()->uid
            ]);
        }
        return response()->json(['isLoggedIn' => false]);
    }
}
