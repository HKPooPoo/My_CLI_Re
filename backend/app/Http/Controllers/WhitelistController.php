<?php

namespace App\Http\Controllers;

use App\Services\WhitelistService;
use Illuminate\Support\Facades\Auth;

class WhitelistController extends Controller
{
    protected WhitelistService $service;

    public function __construct(WhitelistService $service)
    {
        $this->service = $service;
    }

    /**
     * GET /api/whitelists
     *
     * Returns presets the authenticated user is cleared to apply
     * (per T1 distribution rules). Members are NOT returned — only
     * id / code / name / description / member_count, since the
     * student set is sensitive. Guests get [] (no access).
     */
    public function index()
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['whitelists' => []]);
        }
        return response()->json(['whitelists' => $this->service->listForApplicant($user)]);
    }
}
