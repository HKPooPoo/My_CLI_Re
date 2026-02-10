<?php

use App\Http\Controllers\TranslationController;
use App\Http\Controllers\SpeechController;
use App\Http\Controllers\StatusController;
use Illuminate\Support\Facades\Route;

// Translation — auto-detect source, target specified by client
Route::post('/translate', [TranslationController::class, 'translate']);

// Speech-to-Text — audio base64 → transcript
Route::post('/speech', [SpeechController::class, 'recognize']);

// Database status check
Route::get('/status', [StatusController::class, 'check']);
