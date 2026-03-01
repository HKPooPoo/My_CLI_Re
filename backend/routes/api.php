<?php

use App\Http\Controllers\TranslationController;
use App\Http\Controllers\SpeechController;
use App\Http\Controllers\StatusController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BlackboardController;
use App\Http\Controllers\WalkieTypieController;
use App\Http\Controllers\FileController;
use App\Http\Controllers\BroadcastChannelController;
use App\Http\Controllers\LlmController;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Broadcast;

// Broadcasting auth — session middleware already in api group (bootstrap/app.php).
// No extra middleware needed: BroadcastController returns 403 if unauthenticated.
// Do NOT use 'prefix' => 'api' — api.php routes already have /api prefix.
Broadcast::routes(['middleware' => []]);
require base_path('routes/channels.php');

// Translation & Speech — expensive AI routes, auth + strict throttle
Route::middleware([/*'auth:sanctum',*/ 'throttle:10,1'])->group(function () {
    Route::post('/translate', [TranslationController::class, 'translate']);
    Route::post('/speech', [SpeechController::class, 'recognize']);
});

// Public reads — 120 req/min per IP
Route::middleware('throttle:120,1')->group(function () {
    Route::get('/status', [StatusController::class, 'check']);
    Route::get('/broadcast/channels', [BroadcastChannelController::class, 'index']);
    Route::get('/broadcast/channels/{channelId}/boards', [BroadcastChannelController::class, 'fetchBoards']);
});

// Auth operations — 30 req/min, no login required
Route::middleware('throttle:30,1')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
});

// Write operations — 60 req/min, auth required (defense-in-depth)
Route::middleware([/*'auth:sanctum',*/ 'throttle:60,1'])->group(function () {
    Route::post('/broadcast/channels/cast', [BroadcastChannelController::class, 'cast']);
    Route::patch('/broadcast/channels/{channelId}', [BroadcastChannelController::class, 'rename']);
    Route::delete('/broadcast/channels/{channelId}', [BroadcastChannelController::class, 'destroy']);
    Route::post('/blackboard/commit', [BlackboardController::class, 'commit']);
});

// File upload — 30 req/min, allows guest uploads (no auth)
// Design decision: anonymous uploads support paste-to-share before login.
// The SHA-256 hash acts as an unguessable access token for retrieval.
Route::middleware('throttle:30,1')->group(function () {
    Route::post('/files', [FileController::class, 'upload']);
});

// Authentication — stateless helpers (low risk, no throttle needed)
Route::post('/logout', [AuthController::class, 'logout']);
Route::get('/auth-status', [AuthController::class, 'status']);

// Auth commands — brute-force risk, throttle strictly
Route::middleware('throttle:10,1')->group(function () {
    Route::post('/auth/command', [AuthController::class, 'executeCommand']);
    Route::post('/auth/request-reset', [AuthController::class, 'requestPasswordReset']);
    Route::post('/auth/request-bind', [AuthController::class, 'requestEmailBinding']);
});

// Blackboard Sync — auth required
Route::middleware([/*'auth:sanctum'*/])->prefix('blackboard')->group(function () {
    Route::get('/branches', [BlackboardController::class, 'fetchBranches']);
    Route::get('/branches/{branchId}', [BlackboardController::class, 'fetchBranchDetails']);
    Route::delete('/branches/{branchId}', [BlackboardController::class, 'destroyBranch']);
});

// Walkie-Typie — public config
Route::get('/walkie-typie/config', [WalkieTypieController::class, 'config']);

// Walkie-Typie — auth required
Route::middleware([/*'auth:sanctum'*/])->prefix('walkie-typie')->group(function () {
    Route::get('/connections', [WalkieTypieController::class, 'index']);
    Route::post('/connections', [WalkieTypieController::class, 'store']);
    Route::post('/signal', [WalkieTypieController::class, 'signal']);
    Route::patch('/connections/{partnerUid}', [WalkieTypieController::class, 'updateTag']);
    Route::delete('/connections/{partnerUid}', [WalkieTypieController::class, 'destroy']);

    // Board Operations (獨立於 Blackboard)
    Route::post('/boards/commit', [WalkieTypieController::class, 'commitBoard']);
    Route::get('/boards/{branchId}', [WalkieTypieController::class, 'fetchBoardRecords']);
});

// Broadcast Channels (pin/unpin — auth required)
Route::middleware([/*'auth:sanctum'*/])->prefix('broadcast')->group(function () {
    Route::post('/channels/{channelId}/pin', [BroadcastChannelController::class, 'pin']);
    Route::delete('/channels/{channelId}/pin', [BroadcastChannelController::class, 'unpin']);
});

// MOD endpoints — public, moderate throttle
Route::middleware('throttle:30,1')->prefix('mods')->group(function () {
    Route::get('/llm/ollama/health', [LlmController::class, 'ollamaHealth']);
});

// LLM chat — AI endpoint, auth + strict throttle
Route::middleware([/*'auth:sanctum',*/ 'throttle:10,1'])->prefix('mods')->group(function () {
    Route::post('/llm/chat', [LlmController::class, 'chat']);
    Route::post('/llm/chat/stream', [LlmController::class, 'chatStream']);
});

// File Download & Meta — throttled
Route::middleware('throttle:60,1')->prefix('files')->group(function () {
    Route::get('/{hash}', [FileController::class, 'download']);
    Route::get('/{hash}/meta', [FileController::class, 'meta']);
    Route::get('/{hash}/exists', [FileController::class, 'exists']);
});

