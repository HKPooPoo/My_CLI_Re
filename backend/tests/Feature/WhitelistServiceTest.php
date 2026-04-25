<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\WhitelistService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class WhitelistServiceTest extends TestCase
{
    use RefreshDatabase;

    private WhitelistService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->service = app(WhitelistService::class);
    }

    // =========================================================================
    //  T2 — whitelist preset CRUD + members
    // =========================================================================

    #[Test] /* W1 */
    public function create_persists_preset_with_empty_members(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A', 'desc');

        $this->assertDatabaseHas('whitelists', [
            'id' => $id,
            'code' => '2026SEHH9990',
            'name' => '2026 SEHH9990 Service Test A',
            'description' => 'desc',
        ]);
        $this->assertEquals([], $this->service->show($id)['members']);
    }

    #[Test] /* W2 */
    public function add_member_is_idempotent(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');

        $this->assertTrue($this->service->addMember($id, 'alice'));
        $this->assertFalse($this->service->addMember($id, 'alice'));

        $this->assertEquals(['alice'], $this->service->show($id)['members']);
    }

    #[Test] /* W3 */
    public function remove_member_clears_uid_from_set(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $this->service->addMember($id, 'alice');
        $this->service->addMember($id, 'bob');

        $this->assertTrue($this->service->removeMember($id, 'alice'));
        $this->assertFalse($this->service->removeMember($id, 'alice'));

        $this->assertEquals(['bob'], $this->service->show($id)['members']);
    }

    #[Test] /* W4 */
    public function add_members_by_title_bulk_adds_matching_users_only(): void
    {
        User::factory()->withTitle('STUDENT_A')->create(['uid' => 'alice']);
        User::factory()->withTitle('STUDENT_A')->create(['uid' => 'bob']);
        User::factory()->withTitle('STUDENT_B')->create(['uid' => 'carol']);

        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');

        $added = $this->service->addMembersByTitle($id, 'STUDENT_A');
        $this->assertEquals(2, $added);
        $this->assertEqualsCanonicalizing(['alice', 'bob'], $this->service->show($id)['members']);
    }

    #[Test] /* W5 */
    public function add_by_title_then_direct_add_does_not_double_distribute(): void
    {
        User::factory()->withTitle('STUDENT')->create(['uid' => 'alice']);
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');

        $this->service->addMembersByTitle($id, 'STUDENT'); // alice in via title
        $this->assertFalse($this->service->addMember($id, 'alice')); // direct add no-ops

        $this->assertEquals(['alice'], $this->service->show($id)['members']);
    }

    #[Test] /* W6 */
    public function is_member_treats_null_whitelist_as_closed(): void
    {
        // Logic flip 2026-04-25: a null whitelistId means "no preset
        // applied" → everyone is a non-member. Owners still see their
        // own resource via the owner-override gate that lives ABOVE
        // this primitive in the calling services.
        $this->assertFalse($this->service->isMember(null, 'anyone'));
    }

    #[Test] /* W6b */
    public function is_member_treats_missing_whitelist_id_as_closed(): void
    {
        // Same conservative posture for a deleted-or-never-existed id —
        // not a member, even though the row doesn't exist to evaluate.
        $this->assertFalse($this->service->isMember(99999, 'anyone'));
    }

    #[Test] /* W7 */
    public function is_member_returns_false_for_non_member(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $this->service->addMember($id, 'alice');

        $this->assertTrue($this->service->isMember($id, 'alice'));
        $this->assertFalse($this->service->isMember($id, 'mallory'));
    }

    #[Test] /* W8 */
    public function delete_cascades_distributions(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $this->service->addDistribution($id, 'rule', title: 'Faculty');

        $this->service->delete($id);

        $this->assertDatabaseMissing('whitelists', ['id' => $id]);
        $this->assertDatabaseMissing('whitelist_distributions', ['whitelist_id' => $id]);
    }

    // =========================================================================
    //  T1 — distribution rules + canUserApply
    // =========================================================================

    #[Test] /* W9 */
    public function add_distribution_rejects_when_both_title_and_uid_null(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');

        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('DISTRIBUTION REQUIRES TITLE OR UID');
        $this->service->addDistribution($id, 'broken-rule');
    }

    #[Test] /* W10 */
    public function can_user_apply_matches_by_title(): void
    {
        $faculty = User::factory()->withTitle('Faculty')->create(['uid' => 'alice']);
        $student = User::factory()->withTitle('Student')->create(['uid' => 'bob']);

        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $this->service->addDistribution($id, 'rule', title: 'Faculty');

        $this->assertTrue($this->service->canUserApply($faculty, $id));
        $this->assertFalse($this->service->canUserApply($student, $id));
    }

    #[Test] /* W11 */
    public function can_user_apply_matches_by_uid(): void
    {
        $alice = User::factory()->withTitle('Faculty')->create(['uid' => 'alice']);
        $bob   = User::factory()->withTitle('Faculty')->create(['uid' => 'bob']);

        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $this->service->addDistribution($id, 'rule', uid: 'alice');

        $this->assertTrue($this->service->canUserApply($alice, $id));
        $this->assertFalse($this->service->canUserApply($bob, $id));
    }

    #[Test] /* W12 */
    public function can_user_apply_or_logic_with_both_columns(): void
    {
        $faculty = User::factory()->withTitle('Faculty')->create(['uid' => 'carol']);
        $alice   = User::factory()->withTitle('Student')->create(['uid' => 'alice']);
        $bob     = User::factory()->withTitle('Student')->create(['uid' => 'bob']);

        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $this->service->addDistribution($id, 'rule', title: 'Faculty', uid: 'alice');

        $this->assertTrue($this->service->canUserApply($faculty, $id));
        $this->assertTrue($this->service->canUserApply($alice, $id));
        $this->assertFalse($this->service->canUserApply($bob, $id));
    }

    #[Test] /* W13 */
    public function can_user_apply_returns_false_for_guest(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $this->service->addDistribution($id, 'rule', title: 'Faculty');

        $this->assertFalse($this->service->canUserApply(null, $id));
    }

    #[Test] /* W13b — regression: null-title user used to match all distributions */
    public function null_title_user_does_not_match_title_only_grants(): void
    {
        $student = User::factory()->create(['uid' => 'student_x', 'title' => null]);

        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $this->service->addDistribution($id, 'rule', title: 'Faculty');

        $this->assertFalse($this->service->canUserApply($student, $id));
        $this->assertEquals([], $this->service->listForApplicant($student));
    }

    #[Test] /* W13c */
    public function null_title_user_still_matches_uid_grants(): void
    {
        $student = User::factory()->create(['uid' => 'student_x', 'title' => null]);

        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $this->service->addDistribution($id, 'rule', uid: 'student_x');

        $this->assertTrue($this->service->canUserApply($student, $id));
        $this->assertEquals(['2026SEHH9990'], array_column($this->service->listForApplicant($student), 'code'));
    }

    #[Test] /* W14 */
    public function list_for_applicant_filters_by_distribution(): void
    {
        $faculty = User::factory()->withTitle('Faculty')->create(['uid' => 'alice']);
        $student = User::factory()->withTitle('Student')->create(['uid' => 'bob']);

        $idA = $this->service->create('2026SEHH9991', '2026 SEHH9991 Service Test B');
        $idB = $this->service->create('2026SEHH9992', '2026 SEHH9992 Service Test C');
        $idC = $this->service->create('2026SEHH9993', '2026 SEHH9993 Service Test D');

        $this->service->addDistribution($idA, 'r', title: 'Faculty');
        $this->service->addDistribution($idB, 'r', uid: 'alice');
        // C has no distribution → no one can apply

        $facultyList = $this->service->listForApplicant($faculty);
        $studentList = $this->service->listForApplicant($student);
        $guestList   = $this->service->listForApplicant(null);

        $this->assertEqualsCanonicalizing(
            ['2026SEHH9991', '2026SEHH9992'],
            array_column($facultyList, 'code')
        );
        $this->assertEquals([], $studentList);
        $this->assertEquals([], $guestList);
    }

    #[Test] /* W15 */
    public function remove_distribution_revokes_application_right(): void
    {
        $alice = User::factory()->withTitle('Faculty')->create(['uid' => 'alice']);

        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $distId = $this->service->addDistribution($id, 'rule', title: 'Faculty');

        $this->assertTrue($this->service->canUserApply($alice, $id));
        $this->assertTrue($this->service->removeDistribution($distId));
        $this->assertFalse($this->service->canUserApply($alice, $id));
    }

    // =========================================================================
    //  Batch member ops — addMembers + setMembers
    // =========================================================================

    #[Test] /* W16 */
    public function add_members_merges_a_uid_list(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');

        $this->service->addMember($id, 'alice');
        $added = $this->service->addMembers($id, ['alice', 'bob', 'carol']);

        $this->assertEquals(2, $added); // alice dedup'd, bob+carol new
        $this->assertEqualsCanonicalizing(
            ['alice', 'bob', 'carol'],
            $this->service->show($id)['members']
        );
    }

    #[Test] /* W17 */
    public function add_members_dedupes_duplicates_inside_input(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');

        $added = $this->service->addMembers($id, ['alice', 'alice', 'bob', 'alice']);
        $this->assertEquals(2, $added);
        $this->assertEqualsCanonicalizing(['alice', 'bob'], $this->service->show($id)['members']);
    }

    #[Test] /* W18 */
    public function add_members_trims_empty_and_non_string_entries(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');

        $added = $this->service->addMembers($id, ['alice', '', '  ', null, 123, 'bob']);
        $this->assertEquals(2, $added);
        $this->assertEqualsCanonicalizing(['alice', 'bob'], $this->service->show($id)['members']);
    }

    #[Test] /* W19 */
    public function set_members_replaces_whole_list_and_reports_diff(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $this->service->addMembers($id, ['alice', 'bob', 'carol']);

        $diff = $this->service->setMembers($id, ['bob', 'carol', 'dave']);

        $this->assertEquals(1, $diff['added']);   // dave new
        $this->assertEquals(1, $diff['removed']); // alice dropped
        $this->assertEquals(2, $diff['kept']);    // bob + carol

        $this->assertEqualsCanonicalizing(
            ['bob', 'carol', 'dave'],
            $this->service->show($id)['members']
        );
    }

    #[Test] /* W20 */
    public function set_members_with_empty_list_wipes_all(): void
    {
        $id = $this->service->create('2026SEHH9990', '2026 SEHH9990 Service Test A');
        $this->service->addMembers($id, ['alice', 'bob']);

        $diff = $this->service->setMembers($id, []);

        $this->assertEquals(0, $diff['added']);
        $this->assertEquals(2, $diff['removed']);
        $this->assertEquals(0, $diff['kept']);
        $this->assertEquals([], $this->service->show($id)['members']);
    }
}
