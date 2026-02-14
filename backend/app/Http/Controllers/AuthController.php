<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
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
