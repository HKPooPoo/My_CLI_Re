<?php

namespace Tests\Feature;

use App\Events\WalkieTypieSignal;
use App\Models\User;
use App\Services\WalkieTypieBoardService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class WalkieTypieBoardServiceTest extends TestCase
{
    use RefreshDatabase;

    private WalkieTypieBoardService $service;
    private User $alice;
    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush(); // Prevent cache pollution between tests
        $this->service = app(WalkieTypieBoardService::class);
        $this->alice = User::factory()->create(['uid' => 'alice']);
        $this->bob = User::factory()->create(['uid' => 'bob']);
    }

    private function createConnection(string $branchId = 'wt-br1'): void
    {
        $now = (int) (microtime(true) * 1000);
        DB::table('walkie_typie_connections')->insert([
            [
                'user_id' => $this->alice->id,
                'partner_id' => $this->bob->id,
                'partner_tag' => 'bob',
                'my_branch_id' => $branchId,
                'partner_branch_id' => $branchId,
                'last_signal' => $now,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $this->bob->id,
                'partner_id' => $this->alice->id,
                'partner_tag' => 'alice',
                'my_branch_id' => $branchId,
                'partner_branch_id' => $branchId,
                'last_signal' => $now,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    // =========================================================================
    //  commit() — basic insert
    // =========================================================================

    #[Test] /* W1 */
    public function commit_stores_records(): void
    {
        Event::fake([WalkieTypieSignal::class]);

        $this->service->commit($this->alice, 'wt-br1', 'Chat', [
            ['timestamp' => 1000, 'text' => 'Hello'],
            ['timestamp' => 2000, 'text' => 'World'],
        ]);

        $this->assertDatabaseCount('walkie_typie_boards', 2);
        $this->assertDatabaseHas('walkie_typie_boards', [
            'user_id' => $this->alice->id,
            'branch_id' => 'wt-br1',
            'timestamp' => 1000,
            'text' => 'Hello',
        ]);
    }

    #[Test] /* W2 */
    public function commit_skips_blank_records(): void
    {
        Event::fake([WalkieTypieSignal::class]);

        $this->service->commit($this->alice, 'wt-br1', 'Chat', [
            ['timestamp' => 1000, 'text' => ''],
            ['timestamp' => 2000, 'text' => 'Keep'],
        ]);

        $this->assertDatabaseCount('walkie_typie_boards', 1);
    }

    // =========================================================================
    //  commit() — LWW delete
    // =========================================================================

    #[Test] /* W3 */
    public function commit_deletes_records_not_in_incoming(): void
    {
        Event::fake([WalkieTypieSignal::class]);

        DB::table('walkie_typie_boards')->insert([
            ['user_id' => $this->alice->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat', 'timestamp' => 1000, 'text' => 'Old', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->alice->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat', 'timestamp' => 2000, 'text' => 'Keep', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->service->commit($this->alice, 'wt-br1', 'Chat', [
            ['timestamp' => 2000, 'text' => 'Updated'],
        ]);

        $this->assertDatabaseCount('walkie_typie_boards', 1);
        $this->assertDatabaseHas('walkie_typie_boards', ['timestamp' => 2000, 'text' => 'Updated']);
        $this->assertDatabaseMissing('walkie_typie_boards', ['timestamp' => 1000]);
    }

    // =========================================================================
    //  commit() — broadcast signal
    // =========================================================================

    #[Test] /* W4 */
    public function commit_broadcasts_signal_to_partner(): void
    {
        Event::fake([WalkieTypieSignal::class]);
        $this->createConnection('wt-br1');

        $this->service->commit($this->alice, 'wt-br1', 'Chat', [
            ['timestamp' => 1000, 'text' => 'Ping'],
        ]);

        Event::assertDispatched(WalkieTypieSignal::class, function ($e) {
            return $e->senderUid === 'alice' && $e->partnerUid === 'bob' && $e->branchId === 'wt-br1';
        });
    }

    #[Test] /* W4b */
    public function commit_updates_last_signal_on_both_sides(): void
    {
        Event::fake([WalkieTypieSignal::class]);
        $this->createConnection('wt-br1');

        $signalBefore = DB::table('walkie_typie_connections')
            ->where('user_id', $this->alice->id)->value('last_signal');

        // Small delay to ensure timestamp changes
        usleep(10000); // 10ms

        $this->service->commit($this->alice, 'wt-br1', 'Chat', [
            ['timestamp' => 1000, 'text' => 'Update'],
        ]);

        $aliceSignal = DB::table('walkie_typie_connections')
            ->where('user_id', $this->alice->id)->value('last_signal');
        $bobSignal = DB::table('walkie_typie_connections')
            ->where('user_id', $this->bob->id)->value('last_signal');

        $this->assertGreaterThan($signalBefore, $aliceSignal);
        $this->assertEquals($aliceSignal, $bobSignal);
    }

    #[Test] /* W5 */
    public function commit_does_not_broadcast_without_connection(): void
    {
        Event::fake([WalkieTypieSignal::class]);

        // No connection created — commit should still work, just no broadcast
        $this->service->commit($this->alice, 'wt-br1', 'Chat', [
            ['timestamp' => 1000, 'text' => 'Solo'],
        ]);

        Event::assertNotDispatched(WalkieTypieSignal::class);
        $this->assertDatabaseHas('walkie_typie_boards', ['text' => 'Solo']);
    }

    // =========================================================================
    //  commit() — cache invalidation
    // =========================================================================

    #[Test] /* W6 */
    public function commit_clears_branch_cache(): void
    {
        Event::fake([WalkieTypieSignal::class]);

        Cache::put('wt:boards:wt-br1', 'cached', 60);

        $this->service->commit($this->alice, 'wt-br1', 'Chat', [
            ['timestamp' => 1000, 'text' => 'New'],
        ]);

        $this->assertNull(Cache::get('wt:boards:wt-br1'));
    }

    // =========================================================================
    //  fetchBoardRecords()
    // =========================================================================

    #[Test] /* W7 */
    public function fetch_returns_records_for_owner(): void
    {
        DB::table('walkie_typie_boards')->insert([
            ['user_id' => $this->alice->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat', 'timestamp' => 2000, 'text' => 'B', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->alice->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat', 'timestamp' => 1000, 'text' => 'A', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $records = $this->service->fetchBoardRecords($this->alice, 'wt-br1');

        $this->assertCount(2, $records);
        $this->assertEquals(1000, $records[0]->timestamp); // ordered ASC
        $this->assertEquals(2000, $records[1]->timestamp);
    }

    #[Test] /* W8 */
    public function fetch_returns_records_for_connected_partner(): void
    {
        $this->createConnection('wt-br1');

        // Alice's records in the shared branch
        DB::table('walkie_typie_boards')->insert([
            'user_id' => $this->alice->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat',
            'timestamp' => 1000, 'text' => 'From Alice', 'created_at' => now(), 'updated_at' => now(),
        ]);

        // Bob should be able to fetch via connection
        $records = $this->service->fetchBoardRecords($this->bob, 'wt-br1');

        $this->assertCount(1, $records);
        $this->assertEquals('From Alice', $records[0]->text);
    }

    #[Test] /* W9 */
    public function fetch_returns_empty_for_unconnected_user(): void
    {
        $stranger = User::factory()->create(['uid' => 'stranger']);

        DB::table('walkie_typie_boards')->insert([
            'user_id' => $this->alice->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat',
            'timestamp' => 1000, 'text' => 'Private', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $records = $this->service->fetchBoardRecords($stranger, 'wt-br1');

        $this->assertEmpty($records);
    }

    // =========================================================================
    //  deleteBoards()
    // =========================================================================

    #[Test] /* W10 */
    public function delete_boards_removes_user_records(): void
    {
        DB::table('walkie_typie_boards')->insert([
            ['user_id' => $this->alice->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat', 'timestamp' => 1000, 'text' => 'A', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->alice->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat', 'timestamp' => 2000, 'text' => 'B', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $deleted = $this->service->deleteBoards($this->alice->id, 'wt-br1');

        $this->assertEquals(2, $deleted);
        $this->assertDatabaseCount('walkie_typie_boards', 0);
    }

    #[Test] /* W11 */
    public function delete_boards_only_affects_specified_user(): void
    {
        DB::table('walkie_typie_boards')->insert([
            ['user_id' => $this->alice->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat', 'timestamp' => 1000, 'text' => 'Alice', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->bob->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat', 'timestamp' => 2000, 'text' => 'Bob', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->service->deleteBoards($this->alice->id, 'wt-br1');

        $this->assertDatabaseCount('walkie_typie_boards', 1);
        $this->assertDatabaseHas('walkie_typie_boards', ['text' => 'Bob']);
    }
}
