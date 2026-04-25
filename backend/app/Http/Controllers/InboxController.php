<?php

namespace App\Http\Controllers;

use App\Services\InboxService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class InboxController extends Controller
{
    protected InboxService $service;

    public function __construct(InboxService $service)
    {
        $this->service = $service;
    }

    /**
     * GET /api/inboxes
     *
     * Lists inboxes the authenticated user can either own, submit
     * to, or read by virtue of having an existing submission.
     * Guests get the public-only slice.
     */
    public function index()
    {
        return response()->json([
            'inboxes' => $this->service->listInboxes(Auth::user()),
        ]);
    }

    /**
     * POST /api/inboxes
     *
     * Owner-side create. Title required (titled users only).
     * `whitelist_id` optional at creation; if provided, caller
     * must hold a T1 grant for it.
     */
    public function store(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $request->validate([
            'name'         => 'required|string|max:255',
            'description'  => 'nullable|string|max:500',
            'whitelist_id' => 'nullable|integer',
        ]);

        $inbox = $this->service->createInbox(
            $user,
            $request->input('name'),
            $request->input('description'),
            $request->input('whitelist_id') !== null ? (int) $request->input('whitelist_id') : null,
        );

        return response()->json(['message' => 'INBOX CREATED', 'inbox' => $inbox]);
    }

    /**
     * PATCH /api/inboxes/{inboxId}
     *
     * Owner rename + description update via one endpoint.
     */
    public function update(Request $request, $inboxId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $request->validate([
            'name'        => 'sometimes|string|max:255',
            'description' => 'sometimes|nullable|string|max:500',
        ]);

        if ($request->has('name')) {
            $this->service->renameInbox($user, (int) $inboxId, $request->input('name'));
        }
        if ($request->has('description')) {
            $this->service->setDescription($user, (int) $inboxId, $request->input('description'));
        }

        return response()->json(['message' => 'INBOX UPDATED']);
    }

    /**
     * DELETE /api/inboxes/{inboxId}
     */
    public function destroy($inboxId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $this->service->deleteInbox($user, (int) $inboxId);
        return response()->json(['message' => 'INBOX DELETED']);
    }

    /**
     * GET /api/inboxes/{inboxId}/submissions
     *
     * Owner-only fetch of every submission. Senders use
     * /api/inboxes/{id}/submission instead.
     */
    public function fetchSubmissions($inboxId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        return response()->json([
            'submissions' => $this->service->fetchSubmissions($user, (int) $inboxId),
        ]);
    }

    /**
     * GET /api/inboxes/{inboxId}/submission
     *
     * Sender-side fetch of my own submission to this inbox. Returns
     * `null` when I haven't submitted yet (not an error — the
     * front-end shows the empty form).
     */
    public function getMySubmission($inboxId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        return response()->json([
            'submission' => $this->service->getMySubmission($user, (int) $inboxId),
        ]);
    }

    /**
     * PUT /api/inboxes/{inboxId}/submission
     *
     * Sender push. Idempotent on (inbox, sender) — resubmit
     * UPDATEs the existing row.
     */
    public function submit(Request $request, $inboxId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $request->validate([
            'sender_text' => 'nullable|string|max:65535',
            'file_hash'   => 'nullable|string|max:255',
        ]);

        $this->service->submit(
            $user,
            (int) $inboxId,
            $request->input('sender_text'),
            $request->input('file_hash'),
        );

        return response()->json(['message' => 'SUBMITTED']);
    }

    /**
     * PUT /api/inboxes/{inboxId}/submission/{senderUid}/feedback
     *
     * Receiver writes feedback. Owner-only. Bumps `feedback_at`
     * so the sender's [NEW] flag can flip without polling content.
     */
    public function writeFeedback(Request $request, $inboxId, $senderUid)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $request->validate([
            'receiver_text' => 'nullable|string|max:65535',
        ]);

        $this->service->writeFeedback(
            $user,
            (int) $inboxId,
            $senderUid,
            $request->input('receiver_text'),
        );

        return response()->json(['message' => 'FEEDBACK SAVED']);
    }

    /**
     * PUT /api/inboxes/{inboxId}/whitelist
     *
     * Owner switches the audience preset. `null` body detaches
     * (becomes public). T1 grant required for non-null switches.
     */
    public function applyWhitelist(Request $request, $inboxId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $request->validate([
            'whitelist_id' => 'nullable|integer',
        ]);

        $this->service->applyWhitelist(
            $user,
            (int) $inboxId,
            $request->input('whitelist_id') !== null ? (int) $request->input('whitelist_id') : null,
        );

        return response()->json(['message' => 'WHITELIST APPLIED']);
    }
}
