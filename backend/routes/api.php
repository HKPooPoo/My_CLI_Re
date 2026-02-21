<?php

use App\Http\Controllers\TranslationController;
use App\Http\Controllers\SpeechController;
use App\Http\Controllers\StatusController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BlackboardController;
use App\Http\Controllers\WalkieTypieController;
use App\Http\Controllers\FileController;
use App\Http\Controllers\BroadcastChannelController;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Broadcast;

use App\Mail\ResetPasscodeMail;

Broadcast::routes(['prefix' => 'api', 'middleware' => ['web', 'auth']]);

Route::get('/mail-preview', function () {
    // 模擬資料
    return new ResetPasscodeMail('test_user_01', '/passwd --token 1234 --new secret');
});

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
Route::post('/auth/command', [AuthController::class, 'executeCommand']);
Route::post('/auth/request-reset', [AuthController::class, 'requestPasswordReset']);
Route::post('/auth/request-bind', [AuthController::class, 'requestEmailBinding']);

// Blackboard Sync
Route::prefix('blackboard')->group(function () {
    Route::post('/commit', [BlackboardController::class, 'commit']);
    Route::get('/branches', [BlackboardController::class, 'fetchBranches']);
    Route::get('/branches/{branchId}', [BlackboardController::class, 'fetchBranchDetails']);
    Route::delete('/branches/{branchId}', [BlackboardController::class, 'destroyBranch']);
});

// Walkie-Typie
Route::prefix('walkie-typie')->group(function () {
    Route::get('/connections', [WalkieTypieController::class, 'index']);
    Route::post('/connections', [WalkieTypieController::class, 'store']);
    Route::post('/signal', [WalkieTypieController::class, 'signal']);
    Route::patch('/connections/{partnerUid}', [WalkieTypieController::class, 'updateTag']);
    Route::delete('/connections/{partnerUid}', [WalkieTypieController::class, 'destroy']);
    Route::get('/config', [WalkieTypieController::class, 'config']);

    // Board Operations (獨立於 Blackboard)
    Route::post('/boards/commit', [WalkieTypieController::class, 'commitBoard']);
    Route::get('/boards/{branchId}', [WalkieTypieController::class, 'fetchBoardRecords']);
});

// Broadcast Channels
Route::prefix('broadcast')->group(function () {
    // Public — no auth gate (service handles optional auth for is_pinned)
    Route::get('/channels', [BroadcastChannelController::class, 'index']);
    Route::get('/channels/{channelId}/boards', [BroadcastChannelController::class, 'fetchBoards']);

    // Requires auth (checked inside controller/service)
    Route::post('/channels/cast', [BroadcastChannelController::class, 'cast']);
    Route::patch('/channels/{channelId}', [BroadcastChannelController::class, 'rename']);
    Route::delete('/channels/{channelId}', [BroadcastChannelController::class, 'destroy']);
    Route::post('/channels/{channelId}/pin', [BroadcastChannelController::class, 'pin']);
    Route::delete('/channels/{channelId}/pin', [BroadcastChannelController::class, 'unpin']);
});

// File Upload & Download
Route::prefix('files')->group(function () {
    Route::post('/', [FileController::class, 'upload']);
    Route::get('/{hash}', [FileController::class, 'download']);
    Route::get('/{hash}/meta', [FileController::class, 'meta']);
    Route::get('/{hash}/exists', [FileController::class, 'exists']);
});


