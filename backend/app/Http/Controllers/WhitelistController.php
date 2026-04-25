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

    /**
     * GET /api/whitelists/{id}/members
     *
     * Returns the full uid array of one preset, but only when the
     * authenticated user has been distributed permission to apply
     * it (T1 grant). A user who can SEE the preset metadata via
     * `index` but doesn't have an apply grant gets 403 here —
     * being able to apply implies you'll see who's in your audience,
     * but bare visibility doesn't.
     */
    public function members($whitelistId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $id = (int) $whitelistId;
        $detail = $this->service->show($id);
        if (!$detail) {
            return response()->json(['message' => 'WHITELIST NOT FOUND'], 404);
        }

        if (!$this->service->canUserApply($user, $id)) {
            return response()->json(['message' => 'NOT AUTHORISED'], 403);
        }

        return response()->json([
            'id'      => $detail['id'],
            'code'    => $detail['code'],
            'name'    => $detail['name'],
            'members' => $detail['members'],
        ]);
    }
}
