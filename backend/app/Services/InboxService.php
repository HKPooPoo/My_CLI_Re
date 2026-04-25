<?php

namespace App\Services;

use App\Events\InboxUpdated;
use App\Models\User;
use App\Services\FileService;
use App\Services\WhitelistService;
use Illuminate\Support\Facades\DB;

/**
 * Inbox subsystem service. Many-to-one transposition of the
 * Broadcast subsystem: N senders write submissions, 1 owner
 * (a "titled" user — lecturer/staff) reads them all and writes
 * unidirectional feedback per submission.
 *
 * Same whitelist subsystem as BC, but with flipped semantics:
 *   BC whitelist members = readers
 *   IX whitelist members = submitters
 *
 * Read-preserved, write-revoked policy on whitelist switch:
 * a sender who once submitted but is no longer in the current
 * whitelist keeps their submission visible (the receiver shouldn't
 * lose data they may have already graded), but can no longer push
 * edits back. New senders must be in the current whitelist.
 */
class InboxService
{
    protected FileService $fileService;
    protected WhitelistService $whitelistService;

    public function __construct(FileService $fileService, WhitelistService $whitelistService)
    {
        $this->fileService = $fileService;
        $this->whitelistService = $whitelistService;
    }

    // ── Visibility (read) ────────────────────────────────────────

    /**
     * Read gate. Inbox is visible to:
     *   - public (whitelist_id IS NULL) → everyone
     *   - owner → always
     *   - whitelist members → yes
     *   - existing submitters whose row is still on the table → yes
     *     (read-preserved after whitelist tightening; the data they
     *     produced shouldn't disappear from their view)
     */
    private function isVisibleTo(object $inbox, ?User $user): bool
    {
        if (empty($inbox->whitelist_id)) return true;
        if (!$user) return false;
        if ((int) $user->id === (int) $inbox->user_id) return true;
        if ($this->whitelistService->isMember((int) $inbox->whitelist_id, $user->uid)) return true;
        return DB::table('inbox_submissions')
            ->where('inbox_id', $inbox->id)
            ->where('user_id', $user->id)
            ->exists();
    }

    private function assertVisibleTo(object $inbox, ?User $user): void
    {
        if (!$this->isVisibleTo($inbox, $user)) abort(403, 'INBOX NOT AVAILABLE');
    }

    /**
     * Write gate for senders. Stricter than visibility — a removed
     * member can still SEE their old submission (read-preserved) but
     * cannot push further edits.
     *   - public → anyone authenticated
     *   - in current whitelist → yes
     *   - owner → yes (they can submit to their own inbox if they want)
     */
    private function isSenderEligible(object $inbox, ?User $user): bool
    {
        if (!$user) return false;
        if (empty($inbox->whitelist_id)) return true;
        if ((int) $user->id === (int) $inbox->user_id) return true;
        return $this->whitelistService->isMember((int) $inbox->whitelist_id, $user->uid);
    }

    // ── Owner-side: list / fetch ─────────────────────────────────

    /**
     * Listing for any user. Returns inboxes the user can read,
     * each with its current submission count for receiver-side
     * dashboarding. The user's own submission's `feedback_at` is
     * folded in so the sender-side UI can drive a [NEW] indicator
     * without a follow-up fetch.
     */
    public function listInboxes(?User $user): array
    {
        $rows = DB::table('inboxes')
            ->leftJoin('users', 'inboxes.user_id', '=', 'users.id')
            ->orderBy('inboxes.last_signal', 'desc')
            ->select(
                'inboxes.*',
                'users.uid as owner_uid',
                'users.title as owner_title'
            )
            ->get();

        $userId = $user?->id;

        return $rows
            ->filter(fn($r) => $this->isVisibleTo($r, $user))
            ->map(function ($r) use ($userId) {
                $submissionCount = (int) DB::table('inbox_submissions')
                    ->where('inbox_id', $r->id)
                    ->count();

                $mySubmission = null;
                if ($userId) {
                    $mySubmission = DB::table('inbox_submissions')
                        ->where('inbox_id', $r->id)
                        ->where('user_id', $userId)
                        ->select('id', 'feedback_at', 'updated_at')
                        ->first();
                }

                return [
                    'id'                => (int) $r->id,
                    'name'              => $r->name,
                    'description'       => $r->description,
                    'owner_uid'         => $r->owner_uid,
                    'owner_title'       => $r->owner_title,
                    'whitelist_id'      => $r->whitelist_id ? (int) $r->whitelist_id : null,
                    'last_signal'       => (int) $r->last_signal,
                    'submission_count'  => $submissionCount,
                    'has_my_submission' => $mySubmission !== null,
                    'my_feedback_at'    => $mySubmission?->feedback_at !== null ? (int) $mySubmission->feedback_at : null,
                ];
            })
            ->values()
            ->toArray();
    }

    /**
     * Owner-side fetch: every submission to this inbox, including
     * sender uid + tag for the preview rail. 403 to non-owners
     * (senders read their own row via getMySubmission, not this).
     */
    public function fetchSubmissions(User $user, int $inboxId): array
    {
        $inbox = DB::table('inboxes')->where('id', $inboxId)->first();
        if (!$inbox) abort(404, 'INBOX NOT FOUND');
        if ((int) $inbox->user_id !== (int) $user->id) abort(403, 'NOT INBOX OWNER');

        $rows = DB::table('inbox_submissions')
            ->leftJoin('users', 'inbox_submissions.user_id', '=', 'users.id')
            ->where('inbox_id', $inboxId)
            ->orderBy('inbox_submissions.updated_at', 'desc')
            ->select(
                'inbox_submissions.*',
                'users.uid as sender_uid',
                'users.title as sender_title'
            )
            ->get();

        // Hide file_hash entries whose blob is missing from disk —
        // mirrors BC fetchBoards behaviour so dead chips don't render.
        $allHashes = [];
        foreach ($rows as $r) {
            if ($r->file_hash) $allHashes[] = $r->file_hash;
        }
        if (!empty($allHashes)) {
            $available = FileService::buildAvailableHashSet($allHashes);
            foreach ($rows as $r) {
                if ($r->file_hash && !isset($available[$r->file_hash])) {
                    $r->file_hash = null;
                }
            }
        }

        return $rows->map(fn($r) => [
            'id'             => (int) $r->id,
            'sender_uid'     => $r->sender_uid,
            'sender_title'   => $r->sender_title,
            'sender_text'    => $r->sender_text,
            'file_hash'      => $r->file_hash,
            'receiver_text'  => $r->receiver_text,
            'feedback_at'    => $r->feedback_at !== null ? (int) $r->feedback_at : null,
            'submitted_at'   => $r->created_at,
            'updated_at'     => $r->updated_at,
        ])->toArray();
    }

    /**
     * Sender-side fetch: just my submission to this inbox. Returns
     * null when I haven't submitted yet — the front-end shows the
     * empty form. 403 when I'm not even allowed to see this inbox
     * (whitelist gate). Owner reading their own submission is fine
     * — they can act as their own sender if they want.
     */
    public function getMySubmission(User $user, int $inboxId): ?array
    {
        $inbox = DB::table('inboxes')->where('id', $inboxId)->first();
        if (!$inbox) abort(404, 'INBOX NOT FOUND');
        $this->assertVisibleTo($inbox, $user);

        $row = DB::table('inbox_submissions')
            ->where('inbox_id', $inboxId)
            ->where('user_id', $user->id)
            ->first();
        if (!$row) return null;

        $fileHash = $row->file_hash;
        if ($fileHash) {
            $available = FileService::buildAvailableHashSet([$fileHash]);
            if (!isset($available[$fileHash])) $fileHash = null;
        }

        return [
            'id'             => (int) $row->id,
            'sender_text'    => $row->sender_text,
            'file_hash'      => $fileHash,
            'receiver_text'  => $row->receiver_text,
            'feedback_at'    => $row->feedback_at !== null ? (int) $row->feedback_at : null,
            'submitted_at'   => $row->created_at,
            'updated_at'     => $row->updated_at,
        ];
    }

    // ── Owner-side: lifecycle ────────────────────────────────────

    public function createInbox(
        User $user,
        string $name,
        ?string $description = null,
        ?int $whitelistId = null,
    ): object {
        if (!$user->title) abort(403, 'TITLE REQUIRED');
        if (DB::table('inboxes')->where('name', $name)->exists()) {
            abort(409, 'NAME ALREADY TAKEN');
        }

        if ($whitelistId !== null) {
            if (!DB::table('whitelists')->where('id', $whitelistId)->exists()) {
                abort(404, 'WHITELIST NOT FOUND');
            }
            if (!$this->whitelistService->canUserApply($user, $whitelistId)) {
                abort(403, 'NOT AUTHORISED FOR THIS WHITELIST');
            }
        }

        $nowMs = (int) (microtime(true) * 1000);
        $inboxId = DB::table('inboxes')->insertGetId([
            'name'         => $name,
            'description'  => $description,
            'user_id'      => $user->id,
            'whitelist_id' => $whitelistId,
            'last_signal'  => $nowMs,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        $inbox = DB::table('inboxes')->where('id', $inboxId)->first();
        broadcast(new InboxUpdated(
            (int) $inboxId, $name, $user->uid, $nowMs, 'create'
        ));
        return $inbox;
    }

    public function renameInbox(User $user, int $inboxId, string $newName): void
    {
        $inbox = $this->loadOwnedOrAbort($user, $inboxId);
        if (DB::table('inboxes')->where('name', $newName)->where('id', '!=', $inboxId)->exists()) {
            abort(409, 'NAME ALREADY TAKEN');
        }
        DB::table('inboxes')->where('id', $inboxId)
            ->update(['name' => $newName, 'updated_at' => now()]);
        broadcast(new InboxUpdated(
            $inboxId, $newName, $user->uid, (int) $inbox->last_signal, 'rename'
        ));
    }

    public function setDescription(User $user, int $inboxId, ?string $description): void
    {
        $this->loadOwnedOrAbort($user, $inboxId);
        DB::table('inboxes')->where('id', $inboxId)
            ->update(['description' => $description, 'updated_at' => now()]);
    }

    public function applyWhitelist(User $user, int $inboxId, ?int $whitelistId): void
    {
        $inbox = $this->loadOwnedOrAbort($user, $inboxId);
        if ($whitelistId !== null) {
            if (!DB::table('whitelists')->where('id', $whitelistId)->exists()) {
                abort(404, 'WHITELIST NOT FOUND');
            }
            if (!$this->whitelistService->canUserApply($user, $whitelistId)) {
                abort(403, 'NOT AUTHORISED FOR THIS WHITELIST');
            }
        }
        DB::table('inboxes')->where('id', $inboxId)
            ->update(['whitelist_id' => $whitelistId, 'updated_at' => now()]);
        broadcast(new InboxUpdated(
            $inboxId, $inbox->name, $user->uid, (int) $inbox->last_signal, 'whitelist'
        ));
    }

    public function deleteInbox(User $user, int $inboxId): void
    {
        $inbox = $this->loadOwnedOrAbort($user, $inboxId);
        DB::transaction(function () use ($inboxId) {
            DB::table('inbox_submissions')->where('inbox_id', $inboxId)->delete();
            DB::table('inboxes')->where('id', $inboxId)->delete();
        });
        broadcast(new InboxUpdated(
            $inboxId, $inbox->name, $user->uid, 0, 'destroy'
        ));
    }

    /**
     * Receiver writes feedback on a specific sender's submission.
     * Touching `feedback_at` (not `updated_at`) lets the sender-side
     * UI flip a [NEW] flag without ambiguity — `updated_at` also
     * bumps on sender edits.
     */
    public function writeFeedback(User $user, int $inboxId, string $senderUid, ?string $receiverText): void
    {
        $inbox = $this->loadOwnedOrAbort($user, $inboxId);

        $sender = DB::table('users')->where('uid', $senderUid)->first();
        if (!$sender) abort(404, 'SENDER NOT FOUND');

        $submission = DB::table('inbox_submissions')
            ->where('inbox_id', $inboxId)
            ->where('user_id', $sender->id)
            ->first();
        if (!$submission) abort(404, 'SUBMISSION NOT FOUND');

        $nowMs = (int) (microtime(true) * 1000);
        DB::table('inbox_submissions')
            ->where('id', $submission->id)
            ->update([
                'receiver_text' => $receiverText,
                'feedback_at'   => $nowMs,
                'updated_at'    => now(),
            ]);
        DB::table('inboxes')->where('id', $inboxId)
            ->update(['last_signal' => $nowMs, 'updated_at' => now()]);

        broadcast(new InboxUpdated(
            $inboxId, $inbox->name, $user->uid, $nowMs, 'feedback'
        ));
    }

    // ── Sender-side: submit / resubmit ───────────────────────────

    /**
     * Sender pushes their submission for this inbox. Idempotent on
     * (inbox_id, user_id): UNIQUE constraint means re-submit
     * UPDATES the existing row rather than INSERTing a sibling.
     * `created_at` stays as the original submission timestamp;
     * `updated_at` reflects the latest edit. `feedback_at` is NOT
     * touched here — only the receiver writes it.
     */
    public function submit(User $user, int $inboxId, ?string $senderText, ?string $fileHash): void
    {
        $inbox = DB::table('inboxes')->where('id', $inboxId)->first();
        if (!$inbox) abort(404, 'INBOX NOT FOUND');
        if (!$this->isSenderEligible($inbox, $user)) {
            abort(403, 'NOT AUTHORISED TO SUBMIT');
        }

        $nowMs = (int) (microtime(true) * 1000);
        $existing = DB::table('inbox_submissions')
            ->where('inbox_id', $inboxId)
            ->where('user_id', $user->id)
            ->first();

        DB::transaction(function () use ($existing, $inboxId, $user, $senderText, $fileHash) {
            if ($existing) {
                DB::table('inbox_submissions')
                    ->where('id', $existing->id)
                    ->update([
                        'sender_text' => $senderText,
                        'file_hash'   => $fileHash,
                        'updated_at'  => now(),
                    ]);
            } else {
                DB::table('inbox_submissions')->insert([
                    'inbox_id'    => $inboxId,
                    'user_id'     => $user->id,
                    'sender_text' => $senderText,
                    'file_hash'   => $fileHash,
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ]);
            }
        });

        if ($fileHash) {
            $this->fileService->markCommittedBatch([$fileHash]);
        }

        DB::table('inboxes')->where('id', $inboxId)
            ->update(['last_signal' => $nowMs, 'updated_at' => now()]);

        $ownerUid = DB::table('users')->where('id', $inbox->user_id)->value('uid');
        broadcast(new InboxUpdated(
            $inboxId, $inbox->name, $ownerUid, $nowMs, 'submit'
        ));
    }

    // ── Internal helpers ─────────────────────────────────────────

    private function loadOwnedOrAbort(User $user, int $inboxId): object
    {
        $inbox = DB::table('inboxes')->where('id', $inboxId)->first();
        if (!$inbox) abort(404, 'INBOX NOT FOUND');
        if ((int) $inbox->user_id !== (int) $user->id) abort(403, 'NOT INBOX OWNER');
        return $inbox;
    }
}
