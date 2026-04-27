<?php

namespace Tests\Feature;

use App\Events\InboxUpdated;
use App\Models\User;
use App\Services\InboxService;
use App\Services\WhitelistService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\Test;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class InboxServiceTest extends TestCase
{
    use RefreshDatabase;

    private InboxService $service;
    private WhitelistService $whitelistService;

    private User $owner;
    private User $studentA;
    private User $studentB;
    private User $studentC;
    private int $whitelistId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(InboxService::class);
        $this->whitelistService = app(WhitelistService::class);

        $this->owner    = User::factory()->withTitle('Faculty')->create(['uid' => 'teacher_x']);
        $this->studentA = User::factory()->withTitle('Student')->create(['uid' => 'studA']);
        $this->studentB = User::factory()->withTitle('Student')->create(['uid' => 'studB']);
        $this->studentC = User::factory()->withTitle('Student')->create(['uid' => 'studC']); // never in whitelist

        $this->whitelistId = $this->whitelistService->create('2026SEHH7777', '2026 SEHH7777 Inbox Test');
        $this->whitelistService->addMember($this->whitelistId, 'studA');
        $this->whitelistService->addMember($this->whitelistId, 'studB');
        $this->whitelistService->addDistribution($this->whitelistId, 'rule', title: 'Faculty');
    }

    // ── Lifecycle ────────────────────────────────────────────────

    #[Test] /* I1 */
    public function create_persists_inbox_and_fires_event(): void
    {
        Event::fake([InboxUpdated::class]);
        $inbox = $this->service->createInbox($this->owner, 'Midterm Essay', 'desc here');

        $this->assertDatabaseHas('inboxes', [
            'id'   => $inbox->id,
            'name' => 'Midterm Essay',
            'description' => 'desc here',
            'user_id' => $this->owner->id,
            'whitelist_id' => null,
        ]);
        Event::assertDispatched(InboxUpdated::class, fn($e) => $e->action === 'create' && $e->inboxId === (int) $inbox->id);
    }

    #[Test] /* I2 */
    public function create_requires_title(): void
    {
        $titleless = User::factory()->create(['uid' => 'plain']);
        $this->expectException(HttpException::class);
        $this->service->createInbox($titleless, 'Whatever');
    }

    #[Test] /* I3 */
    public function create_rejects_duplicate_name(): void
    {
        $this->service->createInbox($this->owner, 'Lab 1');
        $this->expectException(HttpException::class);
        $this->service->createInbox($this->owner, 'Lab 1');
    }

    #[Test] /* I4 */
    public function create_with_whitelist_requires_t1_grant(): void
    {
        $rogue = User::factory()->withTitle('IntruderTitle')->create(['uid' => 'rogue']);
        $this->expectException(HttpException::class);
        $this->service->createInbox($rogue, 'Rogue Inbox', null, $this->whitelistId);
    }

    #[Test] /* I5 */
    public function rename_owner_only(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Old');
        $this->expectException(HttpException::class);
        $this->service->renameInbox($this->studentA, (int) $inbox->id, 'Hijacked');
    }

    #[Test] /* I6 */
    public function delete_removes_inbox_and_submissions_via_cascade(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Doomed', null, $this->whitelistId);
        $this->service->submit($this->studentA, (int) $inbox->id, 'hi', null);
        $this->service->deleteInbox($this->owner, (int) $inbox->id);

        $this->assertDatabaseMissing('inboxes', ['id' => $inbox->id]);
        $this->assertDatabaseMissing('inbox_submissions', ['inbox_id' => $inbox->id]);
    }

    // ── Visibility (read) ────────────────────────────────────────

    #[Test] /* I7 */
    public function listing_hides_no_whitelist_inbox_from_non_owners(): void
    {
        // Logic flip 2026-04-25: a fresh inbox without a whitelist is
        // CLOSED to non-owners (was: public). Owner still sees their
        // own row; everyone else sees an empty list until a preset is
        // applied.
        $this->service->createInbox($this->owner, 'NoWhitelist');
        $rogue = User::factory()->create(['uid' => 'rogue']);

        $this->assertCount(0, $this->service->listInboxes($rogue));
        $this->assertCount(1, $this->service->listInboxes($this->owner));
    }

    #[Test] /* I8 */
    public function listing_omits_private_inbox_for_non_member(): void
    {
        $this->service->createInbox($this->owner, 'Priv', null, $this->whitelistId);
        $list = $this->service->listInboxes($this->studentC);
        $this->assertCount(0, $list);
    }

    #[Test] /* I9 */
    public function listing_includes_private_inbox_for_owner(): void
    {
        $this->service->createInbox($this->owner, 'Priv', null, $this->whitelistId);
        $list = $this->service->listInboxes($this->owner);
        $this->assertCount(1, $list);
    }

    #[Test] /* I10 */
    public function listing_includes_private_inbox_for_whitelist_member(): void
    {
        $this->service->createInbox($this->owner, 'Priv', null, $this->whitelistId);
        $list = $this->service->listInboxes($this->studentA);
        $this->assertCount(1, $list);
    }

    #[Test] /* I11 */
    public function evicted_student_loses_visibility(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'PreserveTest', null, $this->whitelistId);
        $this->service->submit($this->studentA, (int) $inbox->id, 'I submitted', null);

        $this->whitelistService->removeMember($this->whitelistId, 'studA');

        $list = $this->service->listInboxes($this->studentA);
        $this->assertCount(0, $list, 'evicted student loses access — no read-preserved');
    }

    // ── Submit (write) ───────────────────────────────────────────

    #[Test] /* I12 */
    public function submit_creates_unique_row_per_sender(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Sub', null, $this->whitelistId);
        $this->service->submit($this->studentA, (int) $inbox->id, 'first', null);
        $this->service->submit($this->studentB, (int) $inbox->id, 'second', null);

        $this->assertEquals(2, DB::table('inbox_submissions')->where('inbox_id', $inbox->id)->count());
    }

    #[Test] /* I13 */
    public function resubmit_updates_existing_row_in_place(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Re', null, $this->whitelistId);
        $this->service->submit($this->studentA, (int) $inbox->id, 'v1', null);
        $this->service->submit($this->studentA, (int) $inbox->id, 'v2', null);

        $rows = DB::table('inbox_submissions')->where('inbox_id', $inbox->id)->get();
        $this->assertCount(1, $rows);
        $this->assertEquals('v2', $rows[0]->sender_text);
    }

    #[Test] /* I14 */
    public function submit_blocked_for_non_member(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Sub', null, $this->whitelistId);
        $this->expectException(HttpException::class);
        $this->service->submit($this->studentC, (int) $inbox->id, 'sneaky', null);
    }

    #[Test] /* I15 */
    public function write_revoked_after_whitelist_removal(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Wr', null, $this->whitelistId);
        $this->service->submit($this->studentA, (int) $inbox->id, 'original', null);
        $this->whitelistService->removeMember($this->whitelistId, 'studA');

        $this->expectException(HttpException::class);
        $this->service->submit($this->studentA, (int) $inbox->id, 'sneaky update', null);
    }

    #[Test] /* I16 */
    public function no_whitelist_inbox_rejects_submissions_from_non_owners(): void
    {
        // Logic flip: without an applied whitelist the inbox is closed.
        // The owner can still submit to themselves (mostly a hypothetical
        // — no real workflow drives this — but it's a useful invariant).
        // Anyone else gets 403.
        $inbox = $this->service->createInbox($this->owner, 'ClosedInbox');
        $rando = User::factory()->create(['uid' => 'rando']);

        $this->expectException(HttpException::class);
        $this->service->submit($rando, (int) $inbox->id, 'hi', null);
    }

    #[Test] /* I16b */
    public function no_whitelist_inbox_accepts_owner_self_submission(): void
    {
        // Owner-self submission still works without a whitelist —
        // owner override sits above the eligibility check.
        $inbox = $this->service->createInbox($this->owner, 'SelfBox');
        $this->service->submit($this->owner, (int) $inbox->id, 'mine', null);
        $this->assertDatabaseHas('inbox_submissions', [
            'inbox_id' => $inbox->id,
            'user_id'  => $this->owner->id,
        ]);
    }

    // ── Feedback ─────────────────────────────────────────────────

    #[Test] /* I17 */
    public function feedback_owner_only(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'F', null, $this->whitelistId);
        $this->service->submit($this->studentA, (int) $inbox->id, 'hi', null);

        $this->expectException(HttpException::class);
        $this->service->writeFeedback($this->studentB, (int) $inbox->id, 'studA', 'sneaky');
    }

    #[Test] /* I18 */
    public function feedback_bumps_feedback_at_only_not_sender_text(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'F2', null, $this->whitelistId);
        $this->service->submit($this->studentA, (int) $inbox->id, 'student wrote this', null);

        $this->service->writeFeedback($this->owner, (int) $inbox->id, 'studA', 'good job');

        $row = DB::table('inbox_submissions')
            ->where('inbox_id', $inbox->id)
            ->where('user_id', $this->studentA->id)
            ->first();
        $this->assertEquals('student wrote this', $row->sender_text);
        $this->assertEquals('good job', $row->receiver_text);
        $this->assertNotNull($row->feedback_at);
    }

    #[Test] /* I19 */
    public function feedback_404_when_submission_missing(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'F3', null, $this->whitelistId);
        $this->expectException(HttpException::class);
        $this->service->writeFeedback($this->owner, (int) $inbox->id, 'studA', 'huh');
    }

    // ── Whitelist switching ──────────────────────────────────────

    #[Test] /* I20 */
    public function apply_whitelist_requires_t1_grant(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'WSwitch');

        $other = $this->whitelistService->create('2026SEHH8888', '2026 SEHH8888 No Grant');
        // No distribution row for $other → owner cannot apply it
        $this->expectException(HttpException::class);
        $this->service->applyWhitelist($this->owner, (int) $inbox->id, $other);
    }

    #[Test] /* I21 */
    public function apply_whitelist_null_detaches_to_closed(): void
    {
        // Detach (apply null) clears the FK. Logic flip: closed state.
        // Non-members can no longer list. Existing submitters keep
        // read access via `inbox_submissions` row check (read-preserved).
        $inbox = $this->service->createInbox($this->owner, 'WD', null, $this->whitelistId);
        $this->service->submit($this->studentA, (int) $inbox->id, 'pre-detach', null);
        $this->service->applyWhitelist($this->owner, (int) $inbox->id, null);

        $row = DB::table('inboxes')->where('id', $inbox->id)->first();
        $this->assertNull($row->whitelist_id);

        // studentC: never submitted → closed
        $this->assertCount(0, $this->service->listInboxes($this->studentC));
        // studentA: had submitted but no whitelist now → closed (no read-preserved)
        $this->assertCount(0, $this->service->listInboxes($this->studentA));
        // owner: always sees
        $this->assertCount(1, $this->service->listInboxes($this->owner));
    }

    // ── Sender's own submission read ─────────────────────────────

    #[Test] /* I22 */
    public function get_my_submission_returns_null_before_first_submit(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Empty', null, $this->whitelistId);
        $this->assertNull($this->service->getMySubmission($this->studentA, (int) $inbox->id));
    }

    #[Test] /* I23 */
    public function get_my_submission_returns_my_row_after_submit(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Mine', null, $this->whitelistId);
        $this->service->submit($this->studentA, (int) $inbox->id, 'my work', null);

        $row = $this->service->getMySubmission($this->studentA, (int) $inbox->id);
        $this->assertNotNull($row);
        $this->assertEquals('my work', $row['sender_text']);
    }

    #[Test] /* I24 */
    public function get_my_submission_blocked_for_non_visible(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Closed', null, $this->whitelistId);
        $this->expectException(HttpException::class);
        $this->service->getMySubmission($this->studentC, (int) $inbox->id);
    }

    // ── canSubmit eligibility flag ───────────────────────────────

    #[Test] /* I25 */
    public function can_submit_true_for_current_member(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Live', null, $this->whitelistId);
        $this->assertTrue($this->service->canSubmit($this->studentA, (int) $inbox->id));
    }

    #[Test] /* I26 */
    public function evicted_member_loses_both_visibility_and_submit(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Evict', null, $this->whitelistId);
        $this->service->submit($this->studentA, (int) $inbox->id, 'first', null);
        $this->whitelistService->removeMember($this->whitelistId, 'studA');

        $this->assertCount(0, $this->service->listInboxes($this->studentA));
        $this->assertFalse($this->service->canSubmit($this->studentA, (int) $inbox->id));
    }

    #[Test] /* I27 */
    public function can_submit_false_after_whitelist_detach(): void
    {
        // Detach (PUT null) → inbox closes. Owner override keeps
        // canSubmit=true for the owner; everyone else (including
        // people who submitted before the detach) loses write access.
        $inbox = $this->service->createInbox($this->owner, 'Detach', null, $this->whitelistId);
        $this->service->submit($this->studentA, (int) $inbox->id, 'first', null);
        $this->service->applyWhitelist($this->owner, (int) $inbox->id, null);

        $this->assertTrue($this->service->canSubmit($this->owner, (int) $inbox->id));
        $this->assertFalse($this->service->canSubmit($this->studentA, (int) $inbox->id));
    }

    #[Test] /* I28 */
    public function can_submit_false_for_unauthenticated(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'Open', null, $this->whitelistId);
        $this->assertFalse($this->service->canSubmit(null, (int) $inbox->id));
    }

    #[Test] /* I29 */
    public function listing_includes_can_submit_flag(): void
    {
        $inbox = $this->service->createInbox($this->owner, 'F', null, $this->whitelistId);
        $list = $this->service->listInboxes($this->studentA);
        $this->assertCount(1, $list);
        $this->assertArrayHasKey('can_submit', $list[0]);
        $this->assertTrue($list[0]['can_submit']);

        // Owner sees it true via override (even though they're not
        // in members).
        $ownerList = $this->service->listInboxes($this->owner);
        $this->assertTrue($ownerList[0]['can_submit']);
    }
}
