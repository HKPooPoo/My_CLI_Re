<?php

namespace Tests\Feature;

use App\Events\WalkieTypieConnectionUpdated;
use App\Events\WalkieTypieContentUpdated;
use App\Events\WalkieTypieSignal;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class WalkieTypieControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;
    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->alice = User::factory()->create(['uid' => 'alice']);
        $this->bob = User::factory()->create(['uid' => 'bob']);
    }

    private function createConnection(): void
    {
        $now = (int) (microtime(true) * 1000);
        $myBranch = "wt_{$this->alice->id}_{$this->bob->id}";
        $partnerBranch = "wt_{$this->bob->id}_{$this->alice->id}";

        DB::table('walkie_typie_connections')->insert([
            [
                'user_id' => $this->alice->id,
                'partner_id' => $this->bob->id,
                'partner_tag' => 'bob',
                'my_branch_id' => $myBranch,
                'partner_branch_id' => $partnerBranch,
                'last_signal' => $now,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $this->bob->id,
                'partner_id' => $this->alice->id,
                'partner_tag' => 'alice',
                'my_branch_id' => $partnerBranch,
                'partner_branch_id' => $myBranch,
                'last_signal' => $now,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    // =========================================================================
    //  POST /api/walkie-typie/connections (store) — happy path
    // =========================================================================

    #[Test]
    public function store_creates_bidirectional_connection(): void
    {
        Event::fake([WalkieTypieConnectionUpdated::class]);

        $response = $this->actingAs($this->alice)->postJson('/api/walkie-typie/connections', [
            'uid' => 'bob',
        ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'CONNECTED']);

        // Both sides should have connection records
        $this->assertDatabaseHas('walkie_typie_connections', [
            'user_id' => $this->alice->id,
            'partner_id' => $this->bob->id,
        ]);
        $this->assertDatabaseHas('walkie_typie_connections', [
            'user_id' => $this->bob->id,
            'partner_id' => $this->alice->id,
        ]);
    }

    #[Test]
    public function store_generates_deterministic_branch_ids(): void
    {
        Event::fake([WalkieTypieConnectionUpdated::class]);

        $this->actingAs($this->alice)->postJson('/api/walkie-typie/connections', [
            'uid' => 'bob',
        ]);

        $conn = DB::table('walkie_typie_connections')
            ->where('user_id', $this->alice->id)
            ->where('partner_id', $this->bob->id)
            ->first();

        $this->assertEquals("wt_{$this->alice->id}_{$this->bob->id}", $conn->my_branch_id);
        $this->assertEquals("wt_{$this->bob->id}_{$this->alice->id}", $conn->partner_branch_id);
    }

    #[Test]
    public function store_returns_connection_data(): void
    {
        Event::fake([WalkieTypieConnectionUpdated::class]);

        $response = $this->actingAs($this->alice)->postJson('/api/walkie-typie/connections', [
            'uid' => 'bob',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['message', 'connection']);

        $conn = $response->json('connection');
        $this->assertEquals('bob', $conn['partner_uid']);
    }

    #[Test]
    public function store_broadcasts_to_both_users(): void
    {
        Event::fake([WalkieTypieConnectionUpdated::class]);

        $this->actingAs($this->alice)->postJson('/api/walkie-typie/connections', [
            'uid' => 'bob',
        ]);

        Event::assertDispatched(WalkieTypieConnectionUpdated::class, function ($e) {
            return $e->userUid === 'alice';
        });
        Event::assertDispatched(WalkieTypieConnectionUpdated::class, function ($e) {
            return $e->userUid === 'bob';
        });
    }

    #[Test]
    public function store_is_idempotent_for_existing_connection(): void
    {
        Event::fake([WalkieTypieConnectionUpdated::class]);

        // Connect twice
        $this->actingAs($this->alice)->postJson('/api/walkie-typie/connections', ['uid' => 'bob']);
        $this->actingAs($this->alice)->postJson('/api/walkie-typie/connections', ['uid' => 'bob']);

        // Should still be exactly 2 rows (one per direction), not 4
        $count = DB::table('walkie_typie_connections')->count();
        $this->assertEquals(2, $count);
    }

    // =========================================================================
    //  POST /api/walkie-typie/connections (store) — validation & guards
    // =========================================================================

    #[Test]
    public function store_returns_401_when_unauthenticated(): void
    {
        $response = $this->postJson('/api/walkie-typie/connections', ['uid' => 'bob']);
        $response->assertStatus(401);
    }

    #[Test]
    public function store_rejects_self_connection(): void
    {
        $response = $this->actingAs($this->alice)->postJson('/api/walkie-typie/connections', [
            'uid' => 'alice',
        ]);

        $response->assertStatus(400)
            ->assertJson(['message' => 'INVALID UID']);
    }

    #[Test]
    public function store_rejects_nonexistent_partner(): void
    {
        $response = $this->actingAs($this->alice)->postJson('/api/walkie-typie/connections', [
            'uid' => 'ghost',
        ]);

        $response->assertStatus(404)
            ->assertJson(['message' => 'USER NOT FOUND']);
    }

    #[Test]
    public function store_rejects_empty_uid(): void
    {
        $response = $this->actingAs($this->alice)->postJson('/api/walkie-typie/connections', [
            'uid' => '',
        ]);

        $response->assertStatus(400)
            ->assertJson(['message' => 'INVALID UID']);
    }

    // =========================================================================
    //  GET /api/walkie-typie/connections (index)
    // =========================================================================

    #[Test]
    public function index_returns_connections_for_authenticated_user(): void
    {
        $this->createConnection();

        $response = $this->actingAs($this->alice)->getJson('/api/walkie-typie/connections');

        $response->assertStatus(200)
            ->assertJsonStructure(['connections'])
            ->assertJsonCount(1, 'connections');

        $conn = $response->json('connections.0');
        $this->assertEquals('bob', $conn['partner_uid']);
    }

    #[Test]
    public function index_returns_empty_when_no_connections(): void
    {
        $response = $this->actingAs($this->alice)->getJson('/api/walkie-typie/connections');

        $response->assertStatus(200)
            ->assertJson(['connections' => []]);
    }

    #[Test]
    public function index_returns_401_when_unauthenticated(): void
    {
        $response = $this->getJson('/api/walkie-typie/connections');
        $response->assertStatus(401);
    }

    #[Test]
    public function index_only_shows_own_connections(): void
    {
        $this->createConnection();
        $charlie = User::factory()->create(['uid' => 'charlie']);

        // Alice has connection to Bob, Charlie has none
        $response = $this->actingAs($charlie)->getJson('/api/walkie-typie/connections');
        $response->assertJsonCount(0, 'connections');
    }

    #[Test]
    public function index_ordered_by_last_signal_desc(): void
    {
        $charlie = User::factory()->create(['uid' => 'charlie']);

        DB::table('walkie_typie_connections')->insert([
            [
                'user_id' => $this->alice->id, 'partner_id' => $this->bob->id,
                'my_branch_id' => 'wt_a_b', 'partner_branch_id' => 'wt_b_a',
                'last_signal' => 1000, 'created_at' => now(), 'updated_at' => now(),
            ],
            [
                'user_id' => $this->alice->id, 'partner_id' => $charlie->id,
                'my_branch_id' => 'wt_a_c', 'partner_branch_id' => 'wt_c_a',
                'last_signal' => 9000, 'created_at' => now(), 'updated_at' => now(),
            ],
        ]);

        $response = $this->actingAs($this->alice)->getJson('/api/walkie-typie/connections');
        $connections = $response->json('connections');

        $this->assertEquals('charlie', $connections[0]['partner_uid']);
        $this->assertEquals('bob', $connections[1]['partner_uid']);
    }

    // =========================================================================
    //  POST /api/walkie-typie/signal
    // =========================================================================

    #[Test]
    public function signal_sends_content_to_partner(): void
    {
        Event::fake([WalkieTypieContentUpdated::class]);
        $this->createConnection();

        $response = $this->actingAs($this->alice)->postJson('/api/walkie-typie/signal', [
            'partner_uid' => 'bob',
            'text' => 'Hello Bob',
            'branch_id' => "wt_{$this->alice->id}_{$this->bob->id}",
        ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'SIGNAL SENT']);

        Event::assertDispatched(WalkieTypieContentUpdated::class, function ($e) {
            return $e->userUid === 'bob'
                && $e->contentData['sender_uid'] === 'alice'
                && $e->contentData['text'] === 'Hello Bob';
        });
    }

    #[Test]
    public function signal_returns_401_when_unauthenticated(): void
    {
        $response = $this->postJson('/api/walkie-typie/signal', [
            'partner_uid' => 'bob',
            'text' => 'Hello',
            'branch_id' => 'br1',
        ]);

        $response->assertStatus(401);
    }

    #[Test]
    public function signal_rejects_nonexistent_partner(): void
    {
        $response = $this->actingAs($this->alice)->postJson('/api/walkie-typie/signal', [
            'partner_uid' => 'ghost',
            'text' => 'Hello',
            'branch_id' => 'br1',
        ]);

        $response->assertStatus(404)
            ->assertJson(['message' => 'PARTNER NOT FOUND']);
    }

    #[Test]
    public function signal_rejects_unconnected_partner(): void
    {
        // No connection created
        $response = $this->actingAs($this->alice)->postJson('/api/walkie-typie/signal', [
            'partner_uid' => 'bob',
            'text' => 'Hello',
            'branch_id' => 'br1',
        ]);

        $response->assertStatus(403)
            ->assertJson(['message' => 'NOT CONNECTED']);
    }

    #[Test]
    public function signal_validates_required_fields(): void
    {
        $response = $this->actingAs($this->alice)->postJson('/api/walkie-typie/signal', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['partner_uid', 'branch_id']);
    }

    // =========================================================================
    //  PATCH /api/walkie-typie/connections/{partnerUid} (updateTag)
    // =========================================================================

    #[Test]
    public function update_tag_changes_partner_tag(): void
    {
        $this->createConnection();

        $response = $this->actingAs($this->alice)->patchJson('/api/walkie-typie/connections/bob', [
            'tag' => 'Bobby',
        ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'TAG UPDATED']);

        $this->assertDatabaseHas('walkie_typie_connections', [
            'user_id' => $this->alice->id,
            'partner_id' => $this->bob->id,
            'partner_tag' => 'Bobby',
        ]);
    }

    #[Test]
    public function update_tag_only_affects_own_side(): void
    {
        $this->createConnection();

        $this->actingAs($this->alice)->patchJson('/api/walkie-typie/connections/bob', [
            'tag' => 'Bobby',
        ]);

        // Bob's side should still have the original tag
        $bobConn = DB::table('walkie_typie_connections')
            ->where('user_id', $this->bob->id)
            ->where('partner_id', $this->alice->id)
            ->first();

        $this->assertEquals('alice', $bobConn->partner_tag);
    }

    #[Test]
    public function update_tag_returns_401_when_unauthenticated(): void
    {
        $response = $this->patchJson('/api/walkie-typie/connections/bob', ['tag' => 'Test']);
        $response->assertStatus(401);
    }

    #[Test]
    public function update_tag_returns_404_for_nonexistent_partner(): void
    {
        $response = $this->actingAs($this->alice)->patchJson('/api/walkie-typie/connections/ghost', [
            'tag' => 'Test',
        ]);

        $response->assertStatus(404)
            ->assertJson(['message' => 'PARTNER NOT FOUND']);
    }

    // =========================================================================
    //  DELETE /api/walkie-typie/connections/{partnerUid} (destroy)
    // =========================================================================

    #[Test]
    public function destroy_removes_bidirectional_connections(): void
    {
        Event::fake([WalkieTypieConnectionUpdated::class]);
        $this->createConnection();

        $response = $this->actingAs($this->alice)->deleteJson('/api/walkie-typie/connections/bob');

        $response->assertStatus(200)
            ->assertJson(['message' => 'CONNECTION DELETED']);

        $this->assertDatabaseMissing('walkie_typie_connections', [
            'user_id' => $this->alice->id,
            'partner_id' => $this->bob->id,
        ]);
        $this->assertDatabaseMissing('walkie_typie_connections', [
            'user_id' => $this->bob->id,
            'partner_id' => $this->alice->id,
        ]);
    }

    #[Test]
    public function destroy_deletes_associated_board_data(): void
    {
        Event::fake([WalkieTypieConnectionUpdated::class, WalkieTypieSignal::class]);
        $this->createConnection();

        $myBranch = "wt_{$this->alice->id}_{$this->bob->id}";
        $partnerBranch = "wt_{$this->bob->id}_{$this->alice->id}";

        // Create board data for both sides
        DB::table('walkie_typie_boards')->insert([
            ['user_id' => $this->alice->id, 'branch_id' => $myBranch, 'branch_name' => 'Chat', 'timestamp' => 1000, 'text' => 'Alice msg', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->bob->id, 'branch_id' => $partnerBranch, 'branch_name' => 'Chat', 'timestamp' => 2000, 'text' => 'Bob msg', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->actingAs($this->alice)->deleteJson('/api/walkie-typie/connections/bob');

        $this->assertDatabaseCount('walkie_typie_boards', 0);
    }

    #[Test]
    public function destroy_broadcasts_to_partner(): void
    {
        Event::fake([WalkieTypieConnectionUpdated::class]);
        $this->createConnection();

        $this->actingAs($this->alice)->deleteJson('/api/walkie-typie/connections/bob');

        Event::assertDispatched(WalkieTypieConnectionUpdated::class, function ($e) {
            return $e->userUid === 'bob'
                && $e->connectionData['deleted'] === true
                && $e->connectionData['partner_uid'] === 'alice';
        });
    }

    #[Test]
    public function destroy_returns_401_when_unauthenticated(): void
    {
        $response = $this->deleteJson('/api/walkie-typie/connections/bob');
        $response->assertStatus(401);
    }

    #[Test]
    public function destroy_returns_404_for_nonexistent_partner(): void
    {
        $response = $this->actingAs($this->alice)->deleteJson('/api/walkie-typie/connections/ghost');
        $response->assertStatus(404);
    }

    #[Test]
    public function destroy_returns_404_for_non_connected_partner(): void
    {
        // Bob exists but no connection
        $response = $this->actingAs($this->alice)->deleteJson('/api/walkie-typie/connections/bob');

        $response->assertStatus(404)
            ->assertJson(['message' => 'CONNECTION NOT FOUND']);
    }

    // =========================================================================
    //  GET /api/walkie-typie/config (public)
    // =========================================================================

    #[Test]
    public function config_returns_reverb_settings(): void
    {
        $response = $this->getJson('/api/walkie-typie/config');

        $response->assertStatus(200)
            ->assertJsonStructure(['key', 'host', 'port', 'scheme']);
    }

    #[Test]
    public function config_accessible_without_auth(): void
    {
        $response = $this->getJson('/api/walkie-typie/config');
        $response->assertStatus(200);
    }

    // =========================================================================
    //  POST /api/walkie-typie/boards/commit (board HTTP)
    // =========================================================================

    #[Test]
    public function commit_board_stores_records_via_http(): void
    {
        Event::fake([WalkieTypieSignal::class]);

        $response = $this->actingAs($this->alice)->postJson('/api/walkie-typie/boards/commit', [
            'branch_id' => 'wt-br1',
            'branch_name' => 'Chat',
            'records' => [
                ['timestamp' => 1000, 'text' => 'Hello from HTTP'],
            ],
        ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'Commit Successful']);

        $this->assertDatabaseHas('walkie_typie_boards', [
            'user_id' => $this->alice->id,
            'text' => 'Hello from HTTP',
        ]);
    }

    #[Test]
    public function commit_board_returns_401_when_unauthenticated(): void
    {
        $response = $this->postJson('/api/walkie-typie/boards/commit', [
            'branch_id' => 'wt-br1',
            'branch_name' => 'Chat',
            'records' => [['timestamp' => 1000, 'text' => 'Hello']],
        ]);

        $response->assertStatus(401);
    }

    #[Test]
    public function commit_board_validates_required_fields(): void
    {
        $response = $this->actingAs($this->alice)->postJson('/api/walkie-typie/boards/commit', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['branch_id', 'branch_name', 'records']);
    }

    // =========================================================================
    //  GET /api/walkie-typie/boards/{branchId} (fetch board HTTP)
    // =========================================================================

    #[Test]
    public function fetch_board_returns_records_for_owner(): void
    {
        DB::table('walkie_typie_boards')->insert([
            'user_id' => $this->alice->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat',
            'timestamp' => 1000, 'text' => 'My record', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->alice)->getJson('/api/walkie-typie/boards/wt-br1');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'records');
        $this->assertEquals('My record', $response->json('records.0.text'));
    }

    #[Test]
    public function fetch_board_returns_records_for_connected_partner(): void
    {
        $this->createConnection();
        $myBranch = "wt_{$this->alice->id}_{$this->bob->id}";

        DB::table('walkie_typie_boards')->insert([
            'user_id' => $this->alice->id, 'branch_id' => $myBranch, 'branch_name' => 'Chat',
            'timestamp' => 1000, 'text' => 'Alice wrote this', 'created_at' => now(), 'updated_at' => now(),
        ]);

        // Bob fetches Alice's branch via connection
        $response = $this->actingAs($this->bob)->getJson("/api/walkie-typie/boards/{$myBranch}");

        $response->assertStatus(200)
            ->assertJsonCount(1, 'records');
    }

    #[Test]
    public function fetch_board_returns_empty_for_stranger(): void
    {
        $stranger = User::factory()->create(['uid' => 'stranger']);

        DB::table('walkie_typie_boards')->insert([
            'user_id' => $this->alice->id, 'branch_id' => 'wt-br1', 'branch_name' => 'Chat',
            'timestamp' => 1000, 'text' => 'Private', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($stranger)->getJson('/api/walkie-typie/boards/wt-br1');

        $response->assertStatus(200)
            ->assertJson(['records' => []]);
    }

    #[Test]
    public function fetch_board_returns_401_when_unauthenticated(): void
    {
        $response = $this->getJson('/api/walkie-typie/boards/wt-br1');
        $response->assertStatus(401);
    }

    // =========================================================================
    //  End-to-end: connect → commit → fetch → disconnect
    // =========================================================================

    #[Test]
    public function full_lifecycle_connect_commit_fetch_disconnect(): void
    {
        Event::fake([WalkieTypieConnectionUpdated::class, WalkieTypieSignal::class]);

        // 1. Connect
        $connectResponse = $this->actingAs($this->alice)->postJson('/api/walkie-typie/connections', [
            'uid' => 'bob',
        ]);
        $connectResponse->assertStatus(200);
        $myBranch = $connectResponse->json('connection.my_branch_id');

        // 2. Commit board data
        $this->actingAs($this->alice)->postJson('/api/walkie-typie/boards/commit', [
            'branch_id' => $myBranch,
            'branch_name' => 'Chat',
            'records' => [
                ['timestamp' => 1000, 'text' => 'Hello Bob'],
                ['timestamp' => 2000, 'text' => 'How are you?'],
            ],
        ])->assertStatus(200);

        // 3. Bob fetches Alice's board via connection
        $fetchResponse = $this->actingAs($this->bob)->getJson("/api/walkie-typie/boards/{$myBranch}");
        $fetchResponse->assertStatus(200)
            ->assertJsonCount(2, 'records');

        // 4. Disconnect
        $this->actingAs($this->alice)->deleteJson('/api/walkie-typie/connections/bob')
            ->assertStatus(200);

        // 5. Board data should be gone
        $this->assertDatabaseCount('walkie_typie_boards', 0);
        $this->assertDatabaseCount('walkie_typie_connections', 0);
    }
}
