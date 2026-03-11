<?php

namespace Tests\Feature;

use App\Events\BlackboardUpdated;
use App\Models\User;
use App\Services\BlackboardService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class BlackboardServiceTest extends TestCase
{
    use RefreshDatabase;

    private BlackboardService $service;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->service = app(BlackboardService::class);
        $this->user = User::factory()->create(['uid' => 'tester']);
    }

    // =========================================================================
    //  commit() — basic insert
    // =========================================================================

    #[Test] /* B1 */
    public function commit_stores_records(): void
    {
        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 1000, 'text' => 'Hello'],
            ['timestamp' => 2000, 'text' => 'World'],
        ]);

        $this->assertDatabaseCount('blackboards', 2);
        $this->assertDatabaseHas('blackboards', [
            'user_id' => $this->user->id,
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'timestamp' => 1000,
            'text' => 'Hello',
        ]);
    }

    #[Test] /* B2 */
    public function commit_skips_blank_records(): void
    {
        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 1000, 'text' => ''],
            ['timestamp' => 2000, 'text' => '  '],
            ['timestamp' => 3000, 'text' => 'Keep me'],
        ]);

        $this->assertDatabaseCount('blackboards', 1);
        $this->assertDatabaseHas('blackboards', ['timestamp' => 3000, 'text' => 'Keep me']);
    }

    #[Test] /* B2b */
    public function commit_keeps_blank_text_if_file_hash_present(): void
    {
        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 1000, 'text' => '', 'file_hash' => 'abc123'],
        ]);

        $this->assertDatabaseCount('blackboards', 1);
        $this->assertDatabaseHas('blackboards', ['timestamp' => 1000, 'file_hash' => 'abc123']);
    }

    // =========================================================================
    //  commit() — LWW delete
    // =========================================================================

    #[Test] /* B3 */
    public function commit_deletes_records_not_in_incoming(): void
    {
        // Pre-populate with 3 records
        DB::table('blackboards')->insert([
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 1000, 'text' => 'Old1', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 2000, 'text' => 'Old2', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 3000, 'text' => 'Old3', 'created_at' => now(), 'updated_at' => now()],
        ]);

        // Commit with only timestamp 2000 — 1000 and 3000 should be deleted
        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 2000, 'text' => 'Updated2'],
        ]);

        $this->assertDatabaseCount('blackboards', 1);
        $this->assertDatabaseHas('blackboards', ['timestamp' => 2000, 'text' => 'Updated2']);
        $this->assertDatabaseMissing('blackboards', ['timestamp' => 1000]);
        $this->assertDatabaseMissing('blackboards', ['timestamp' => 3000]);
    }

    #[Test] /* B3b */
    public function commit_lww_only_affects_same_user_and_branch(): void
    {
        $other = User::factory()->create(['uid' => 'other']);

        // Other user's record in same branch_id
        DB::table('blackboards')->insert([
            'user_id' => $other->id, 'branch_id' => 'br1', 'branch_name' => 'Main',
            'timestamp' => 9000, 'text' => 'Other user', 'created_at' => now(), 'updated_at' => now(),
        ]);
        // Same user, different branch
        DB::table('blackboards')->insert([
            'user_id' => $this->user->id, 'branch_id' => 'br2', 'branch_name' => 'Side',
            'timestamp' => 8000, 'text' => 'Other branch', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 1000, 'text' => 'New'],
        ]);

        // Other user's record and other branch should be untouched
        $this->assertDatabaseHas('blackboards', ['user_id' => $other->id, 'timestamp' => 9000]);
        $this->assertDatabaseHas('blackboards', ['branch_id' => 'br2', 'timestamp' => 8000]);
    }

    // =========================================================================
    //  commit() — timestamp deduplication
    // =========================================================================

    #[Test] /* B4 */
    public function commit_deduplicates_by_timestamp(): void
    {
        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 1000, 'text' => 'First version'],
            ['timestamp' => 1000, 'text' => 'Last version'],
        ]);

        $this->assertDatabaseCount('blackboards', 1);
        $this->assertDatabaseHas('blackboards', ['timestamp' => 1000, 'text' => 'Last version']);
    }

    // =========================================================================
    //  commit() — file hash normalization
    // =========================================================================

    #[Test] /* B5 */
    public function commit_normalizes_file_hash_array_to_json(): void
    {
        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 1000, 'text' => 'With files', 'file_hash' => ['hash1', 'hash2']],
        ]);

        $row = DB::table('blackboards')->where('timestamp', 1000)->first();
        $this->assertEquals('["hash1","hash2"]', $row->file_hash);
    }

    #[Test] /* B5b */
    public function commit_preserves_json_string_file_hash(): void
    {
        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 1000, 'text' => 'With files', 'file_hash' => '["hash1","hash2"]'],
        ]);

        $row = DB::table('blackboards')->where('timestamp', 1000)->first();
        $this->assertEquals('["hash1","hash2"]', $row->file_hash);
    }

    #[Test] /* B5c */
    public function commit_preserves_single_string_file_hash(): void
    {
        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 1000, 'text' => 'With file', 'file_hash' => 'singlehash'],
        ]);

        $row = DB::table('blackboards')->where('timestamp', 1000)->first();
        $this->assertEquals('singlehash', $row->file_hash);
    }

    // =========================================================================
    //  commit() — cache & events
    // =========================================================================

    #[Test] /* B6 */
    public function commit_clears_cache(): void
    {
        Cache::put("user:{$this->user->id}:branches", 'cached', 60);
        Cache::put("bb:branch:{$this->user->id}:br1:details", 'cached', 60);

        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 1000, 'text' => 'New'],
        ]);

        $this->assertNull(Cache::get("user:{$this->user->id}:branches"));
        $this->assertNull(Cache::get("bb:branch:{$this->user->id}:br1:details"));
    }

    #[Test] /* B7 */
    public function commit_broadcasts_when_device_id_provided(): void
    {
        Event::fake([BlackboardUpdated::class]);

        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 1000, 'text' => 'Synced'],
        ], 'device-abc');

        Event::assertDispatched(BlackboardUpdated::class, function ($e) {
            return $e->uid === 'tester' && $e->branchId === 'br1' && $e->deviceId === 'device-abc';
        });
    }

    #[Test] /* B7b */
    public function commit_does_not_broadcast_without_device_id(): void
    {
        Event::fake([BlackboardUpdated::class]);

        $this->service->commit($this->user, 'br1', 'Main', [
            ['timestamp' => 1000, 'text' => 'Local only'],
        ]);

        Event::assertNotDispatched(BlackboardUpdated::class);
    }

    // =========================================================================
    //  commit() — empty records (branch wipe)
    // =========================================================================

    #[Test] /* B8 */
    public function commit_empty_records_clears_branch(): void
    {
        DB::table('blackboards')->insert([
            'user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main',
            'timestamp' => 1000, 'text' => 'Existing', 'created_at' => now(), 'updated_at' => now(),
        ]);

        // Commit with empty records — all existing should be deleted
        $this->service->commit($this->user, 'br1', 'Main', []);

        $this->assertDatabaseCount('blackboards', 0);
    }

    // =========================================================================
    //  fetchBranches()
    // =========================================================================

    #[Test] /* B9 */
    public function fetch_branches_returns_grouped_data(): void
    {
        DB::table('blackboards')->insert([
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 1000, 'text' => 'A', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 2000, 'text' => 'B', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->user->id, 'branch_id' => 'br2', 'branch_name' => 'Side', 'timestamp' => 3000, 'text' => 'C', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $branches = $this->service->fetchBranches($this->user);

        $this->assertCount(2, $branches);
        // Ordered by last_update desc — br2 (3000) first, br1 (2000) second
        $this->assertEquals('br2', $branches[0]->branch_id);
        $this->assertEquals('br1', $branches[1]->branch_id);
        $this->assertEquals(2000, $branches[1]->last_update);
    }

    #[Test] /* B10 */
    public function fetch_branches_returns_empty_for_no_data(): void
    {
        $branches = $this->service->fetchBranches($this->user);
        $this->assertCount(0, $branches);
    }

    // =========================================================================
    //  fetchBranchDetails()
    // =========================================================================

    #[Test] /* B11 */
    public function fetch_branch_details_returns_records_ordered_by_timestamp(): void
    {
        DB::table('blackboards')->insert([
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 3000, 'text' => 'Third', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 1000, 'text' => 'First', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 2000, 'text' => 'Second', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $records = $this->service->fetchBranchDetails($this->user, 'br1');

        $this->assertCount(3, $records);
        $this->assertEquals(1000, $records[0]->timestamp);
        $this->assertEquals(2000, $records[1]->timestamp);
        $this->assertEquals(3000, $records[2]->timestamp);
    }

    #[Test] /* B12 */
    public function fetch_branch_details_returns_empty_for_non_owner(): void
    {
        $other = User::factory()->create(['uid' => 'other']);
        DB::table('blackboards')->insert([
            'user_id' => $other->id, 'branch_id' => 'br1', 'branch_name' => 'Main',
            'timestamp' => 1000, 'text' => 'Secret', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $records = $this->service->fetchBranchDetails($this->user, 'br1');

        $this->assertEmpty($records);
    }

    // =========================================================================
    //  deleteBranch()
    // =========================================================================

    #[Test] /* B13 */
    public function delete_branch_removes_all_records_and_clears_cache(): void
    {
        DB::table('blackboards')->insert([
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 1000, 'text' => 'A', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 2000, 'text' => 'B', 'created_at' => now(), 'updated_at' => now()],
        ]);
        Cache::put("user:{$this->user->id}:branches", 'cached', 60);

        $deleted = $this->service->deleteBranch($this->user, 'br1');

        $this->assertEquals(2, $deleted);
        $this->assertDatabaseCount('blackboards', 0);
        $this->assertNull(Cache::get("user:{$this->user->id}:branches"));
    }

    #[Test] /* B14 */
    public function delete_branch_returns_zero_for_nonexistent(): void
    {
        $deleted = $this->service->deleteBranch($this->user, 'nonexistent');
        $this->assertEquals(0, $deleted);
    }
}
