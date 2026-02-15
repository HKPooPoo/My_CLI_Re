<?php

use App\Http\Controllers\TranslationController;
use App\Http\Controllers\SpeechController;
use App\Http\Controllers\StatusController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BlackboardController;
use Illuminate\Support\Facades\Route;

// Translation — auto-detect source, target specified by client
Route::post('/translate', [TranslationController::class, 'translate']);

// Speech-to-Text — audio base64 → transcript
Route::post('/speech', [SpeechController::class, 'recognize']);

// Database status check
Route::get('/status', [StatusController::class, 'check']);

// Authentication
Route::post('/login', [AuthController::class, 'login']);
Route::post('/register', [AuthController::class, 'register']);
Route::post('/logout', [AuthController::class, 'logout']);
Route::get('/auth-status', [AuthController::class, 'status']);

// Blackboard Sync
Route::prefix('blackboard')->group(function () {
    Route::post('/commit', [BlackboardController::class, 'commit']);
    Route::get('/branches', [BlackboardController::class, 'fetchBranches']);
    Route::get('/branches/{branchId}', [BlackboardController::class, 'fetchBranchDetails']);
});

