<?php

namespace App\Http\Controllers;

use App\Services\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function __construct(
        private SettingsService $settingsService
    ) {}

    public function show(Request $request): JsonResponse
    {
        $settings = $this->settingsService->get($request->user());

        return response()->json([
            'settings' => $settings,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'settings' => 'required|array',
        ]);

        $this->settingsService->save($request->user(), $request->input('settings'));

        return response()->json([
            'message' => 'Settings saved.',
        ]);
    }
}
