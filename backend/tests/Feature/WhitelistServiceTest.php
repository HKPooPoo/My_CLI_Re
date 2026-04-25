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
        $id = $this->service->create('2026_TEST', 'Test Whitelist', 'desc');

        $this->assertDatabaseHas('whitelists', [
            'id' => $id,
            'code' => '2026_TEST',
            'name' => 'Test Whitelist',
            'description' => 'desc',
        ]);
        $this->assertEquals([], $this->service->show($id)['members']);
    }

    #[Test] /* W2 */
    public function add_member_is_idempotent(): void
    {
        $id = $this->service->create('2026_TEST', 'Test');

        $this->assertTrue($this->service->addMember($id, 'alice'));
        $this->assertFalse($this->service->addMember($id, 'alice'));

        $this->assertEquals(['alice'], $this->service->show($id)['members']);
    }

    #[Test] /* W3 */
    public function remove_member_clears_uid_from_set(): void
    {
        $id = $this->service->create('2026_TEST', 'Test');
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

        $id = $this->service->create('2026_TEST', 'Test');

        $added = $this->service->addMembersByTitle($id, 'STUDENT_A');
        $this->assertEquals(2, $added);
        $this->assertEqualsCanonicalizing(['alice', 'bob'], $this->service->show($id)['members']);
    }

    #[Test] /* W5 */
    public function add_by_title_then_direct_add_does_not_double_distribute(): void
    {
        User::factory()->withTitle('STUDENT')->create(['uid' => 'alice']);
        $id = $this->service->create('2026_TEST', 'Test');

        $this->service->addMembersByTitle($id, 'STUDENT'); // alice in via title
        $this->assertFalse($this->service->addMember($id, 'alice')); // direct add no-ops

        $this->assertEquals(['alice'], $this->service->show($id)['members']);
    }

    #[Test] /* W6 */
    public function is_member_handles_null_whitelist_as_public(): void
    {
        $this->assertTrue($this->service->isMember(null, 'anyone'));
    }

    #[Test] /* W7 */
    public function is_member_returns_false_for_non_member(): void
    {
        $id = $this->service->create('2026_TEST', 'Test');
        $this->service->addMember($id, 'alice');

        $this->assertTrue($this->service->isMember($id, 'alice'));
        $this->assertFalse($this->service->isMember($id, 'mallory'));
    }

    #[Test] /* W8 */
    public function delete_cascades_distributions(): void
    {
        $id = $this->service->create('2026_TEST', 'Test');
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
        $id = $this->service->create('2026_TEST', 'Test');

        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('DISTRIBUTION REQUIRES TITLE OR UID');
        $this->service->addDistribution($id, 'broken-rule');
    }

    #[Test] /* W10 */
    public function can_user_apply_matches_by_title(): void
    {
        $faculty = User::factory()->withTitle('Faculty')->create(['uid' => 'alice']);
        $student = User::factory()->withTitle('Student')->create(['uid' => 'bob']);

        $id = $this->service->create('2026_TEST', 'Test');
        $this->service->addDistribution($id, 'rule', title: 'Faculty');

        $this->assertTrue($this->service->canUserApply($faculty, $id));
        $this->assertFalse($this->service->canUserApply($student, $id));
    }

    #[Test] /* W11 */
    public function can_user_apply_matches_by_uid(): void
    {
        $alice = User::factory()->withTitle('Faculty')->create(['uid' => 'alice']);
        $bob   = User::factory()->withTitle('Faculty')->create(['uid' => 'bob']);

        $id = $this->service->create('2026_TEST', 'Test');
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

        $id = $this->service->create('2026_TEST', 'Test');
        $this->service->addDistribution($id, 'rule', title: 'Faculty', uid: 'alice');

        $this->assertTrue($this->service->canUserApply($faculty, $id));
        $this->assertTrue($this->service->canUserApply($alice, $id));
        $this->assertFalse($this->service->canUserApply($bob, $id));
    }

    #[Test] /* W13 */
    public function can_user_apply_returns_false_for_guest(): void
    {
        $id = $this->service->create('2026_TEST', 'Test');
        $this->service->addDistribution($id, 'rule', title: 'Faculty');

        $this->assertFalse($this->service->canUserApply(null, $id));
    }

    #[Test] /* W14 */
    public function list_for_applicant_filters_by_distribution(): void
    {
        $faculty = User::factory()->withTitle('Faculty')->create(['uid' => 'alice']);
        $student = User::factory()->withTitle('Student')->create(['uid' => 'bob']);

        $idA = $this->service->create('2026_A', 'A');
        $idB = $this->service->create('2026_B', 'B');
        $idC = $this->service->create('2026_C', 'C');

        $this->service->addDistribution($idA, 'r', title: 'Faculty');
        $this->service->addDistribution($idB, 'r', uid: 'alice');
        // C has no distribution → no one can apply

        $facultyList = $this->service->listForApplicant($faculty);
        $studentList = $this->service->listForApplicant($student);
        $guestList   = $this->service->listForApplicant(null);

        $this->assertEqualsCanonicalizing(
            ['2026_A', '2026_B'],
            array_column($facultyList, 'code')
        );
        $this->assertEquals([], $studentList);
        $this->assertEquals([], $guestList);
    }

    #[Test] /* W15 */
    public function remove_distribution_revokes_application_right(): void
    {
        $alice = User::factory()->withTitle('Faculty')->create(['uid' => 'alice']);

        $id = $this->service->create('2026_TEST', 'Test');
        $distId = $this->service->addDistribution($id, 'rule', title: 'Faculty');

        $this->assertTrue($this->service->canUserApply($alice, $id));
        $this->assertTrue($this->service->removeDistribution($distId));
        $this->assertFalse($this->service->canUserApply($alice, $id));
    }
}
