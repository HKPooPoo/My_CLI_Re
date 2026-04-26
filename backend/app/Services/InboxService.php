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
     *   - owner → always
     *   - members of the currently-applied whitelist → yes
     *   - existing submitters whose row is still on the table → yes
     *     (read-preserved: an evicted member or a member of a former
     *     whitelist that has since been detached / swapped keeps
     *     read access to data they personally produced)
     *
     * **No whitelist = closed.** A fresh inbox without an applied
     * preset is invisible to non-owners (and impossible to submit
     * to). The owner must explicitly apply a whitelist to open it.
     */
    private function isVisibleTo(object $inbox, ?User $user): bool
    {
        if (!$user) return false;
        if ((int) $user->id === (int) $inbox->user_id) return true;
        if (!empty($inbox->whitelist_id)
            && $this->whitelistService->isMember((int) $inbox->whitelist_id, $user->uid)) {
            return true;
        }
        // Read-preserved: the user has an existing submission on this
        // inbox. Could be from when they were a member of the
        // currently-applied whitelist, or from a previous whitelist
        // that was swapped out, or from an open period before the
        // current preset was applied.
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
     *   - owner → yes (they can submit to their own inbox if they want)
     *   - in current whitelist → yes
     *   - everyone else → no
     *
     * **No whitelist = closed.** Without an applied preset the inbox
     * accepts no submissions — not even from previous submitters.
     */
    private function isSenderEligible(object $inbox, ?User $user): bool
    {
        if (!$user) return false;
        if ((int) $user->id === (int) $inbox->user_id) return true;
        if (empty($inbox->whitelist_id)) return false;
        return $this->whitelistService->isMember((int) $inbox->whitelist_id, $user->uid);
    }

    /**
     * Public canSubmit check — used by the controller to embed an
     * eligibility flag in the GET responses so the front-end can
     * gate edits without a separate roundtrip per textarea keystroke.
     * Returns false on missing inbox / unauthenticated user.
     */
    public function canSubmit(?User $user, int $inboxId): bool
    {
        if (!$user) return false;
        $inbox = DB::table('inboxes')->where('id', $inboxId)->first();
        if (!$inbox) return false;
        return $this->isSenderEligible($inbox, $user);
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
            ->map(function ($r) use ($userId, $user) {
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

                // Eligibility flag — drives front-end disable rules
                // for senderArea / POST / file picker. Read-preserved
                // users (existing submission, no longer in whitelist)
                // get can_submit=false here.
                $canSubmit = $this->isSenderEligible($r, $user);

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
                    'can_submit'        => $canSubmit,
                ];
            })
            ->values()
            ->toArray();
    }

    /**
     * Owner-side fetch: every submission to this inbox, including
     * sender uid + tag for the preview rail. 403 to non-owners
     * (senders read their own row via getMySubmission, not this).
     *
     * Ordering is by sender `users.uid` ASC — the lecturer's preview
     * rail reads as a roll-call: S20260001 first, S20260002 next,
     * etc., regardless of submission/feedback time. Stable position
     * per student is more useful for "did everyone submit?" scanning
     * than activity-driven ordering. Matches the no-drag-reorder
     * contract on the rail (the lecturer can't reorder; the
     * alphabetical roll is the only meaningful order).
     */
    /**
     * Returns `['members' => [...uids], 'submissions' => [...rows]]`.
     *
     * `members` = the full whitelist roster (uid-asc), regardless of
     * whether each member has submitted. The preview rail renders one
     * block per member; clicking a non-submitted member shows empty
     * SUBMISSION + FEEDBACK windows. This makes the rail a roll-call
     * — the lecturer sees who is missing, not just who is present.
     *
     * `submissions` = the actual `inbox_submissions` rows, keyed by
     * `sender_uid` for easy lookup on the frontend.
     */
    public function fetchSubmissions(User $user, int $inboxId): array
    {
        $inbox = DB::table('inboxes')->where('id', $inboxId)->first();
        if (!$inbox) abort(404, 'INBOX NOT FOUND');
        if ((int) $inbox->user_id !== (int) $user->id) abort(403, 'NOT INBOX OWNER');

        // Full whitelist member roster (uid-asc via decodeMembers sort).
        $members = [];
        if ($inbox->whitelist_id) {
            $wl = DB::table('whitelists')->where('id', $inbox->whitelist_id)->first();
            if ($wl) $members = $this->whitelistService->decodeMembers($wl->members ?? null);
        }

        $rows = DB::table('inbox_submissions')
            ->leftJoin('users', 'inbox_submissions.user_id', '=', 'users.id')
            ->where('inbox_id', $inboxId)
            ->orderBy('users.uid', 'asc')
            ->select(
                'inbox_submissions.*',
                'users.uid as sender_uid',
                'users.title as sender_title'
            )
            ->get();

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

        $submissions = $rows->map(fn($r) => [
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

        return ['members' => $members, 'submissions' => $submissions];
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

    /**
     * Update the instruction pane (per-inbox text + files). Partial
     * update: only the fields whose `$has*` flag is true are written.
     * Keeps the controller thin — it just forwards request->has checks.
     */
    public function setInstruction(
        User $user, int $inboxId,
        ?string $description, ?array $instructionFiles,
        bool $hasDescription, bool $hasFiles,
    ): void {
        $this->loadOwnedOrAbort($user, $inboxId);
        $update = ['updated_at' => now()];
        if ($hasDescription)  $update['description'] = $description;
        if ($hasFiles)        $update['instruction_files'] = $instructionFiles !== null
                                    ? json_encode($instructionFiles) : null;
        DB::table('inboxes')->where('id', $inboxId)->update($update);
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
