<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    // Register
    public function register(Request $request)
    {
        $request->validate([
            'uid' => 'required|string|unique:users',
            'passcode' => 'required|string|min:4',
        ]);

        $user = User::create([
            'uid' => $request->uid,
            // Hashing passcode into password field
            'password' => Hash::make($request->passcode),
            // Default email to null or something if needed, but we made it nullable
        ]);

        return response()->json([
            'message' => 'User registered successfully',
            'user' => [
                'uid' => $user->uid,
                'created_at' => $user->created_at
            ]
        ], 201);
    }

    // Login
    public function login(Request $request)
    {
        $request->validate([
            'uid' => 'required|string',
            'passcode' => 'required|string',
        ]);

        $user = User::where('uid', $request->uid)->first();

        // Check if user exists and passcode matches
        if (!$user || !Hash::check($request->passcode, $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        // For simple token based auth (or just session if using Sanctum later)
        // Since we are not fully setting up Sanctum in this step, we will return a success message
        // In a real app, we would return $user->createToken('token-name')->plainTextToken;

        return response()->json([
            'message' => 'Login successful',
            'user' => [
                'uid' => $user->uid,
                'last_login' => now()
            ]
        ]);
    }
}
