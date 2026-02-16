<?php

namespace App\Http\Controllers;

use App\Services\AuthService;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Http\Requests\Auth\ExecuteCommandRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
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
                'user' => ['uid' => $user->uid]
            ]);
        } catch (\Exception $e) {
            Log::error('Login Error: ' . $e->getMessage());
            return response()->json(['message' => 'SERVER ERROR', 'error' => $e->getMessage()], 500);
        }
    }

    public function logout()
    {
        Auth::logout();
        return response()->json(['message' => 'LOGGED OUT']);
    }

    public function status()
    {
        if (Auth::check()) {
            $user = Auth::user();
            return response()->json([
                'isLoggedIn' => true,
                'uid' => $user->uid,
                'email' => $user->email
            ]);
        }
        return response()->json(['isLoggedIn' => false]);
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
            if (!$user) return response()->json(['message' => 'AUTH REQUIRED.'], 401);

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
}
