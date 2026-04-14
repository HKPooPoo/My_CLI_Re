<?php

namespace Tests\Feature;

use App\Events\BlackboardUpdated;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class BlackboardControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->user = User::factory()->create(['uid' => 'bb-tester']);
    }

    // =========================================================================
    //  POST /api/blackboard/commit — happy path
    // =========================================================================

    #[Test]
    public function commit_returns_success_for_authenticated_user(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => [
                ['timestamp' => 1000, 'text' => 'Hello World'],
            ],
        ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'Commit Successful']);

        $this->assertDatabaseHas('blackboards', [
            'user_id' => $this->user->id,
            'branch_id' => 'br1',
            'text' => 'Hello World',
        ]);
    }

    #[Test]
    public function commit_with_device_id_broadcasts_event(): void
    {
        Event::fake([BlackboardUpdated::class]);

        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => [
                ['timestamp' => 1000, 'text' => 'Synced record'],
            ],
            'device_id' => 'device-xyz',
        ]);

        $response->assertStatus(200);
        Event::assertDispatched(BlackboardUpdated::class, function ($e) {
            return $e->uid === 'bb-tester'
                && $e->branchId === 'br1'
                && $e->deviceId === 'device-xyz';
        });
    }

    #[Test]
    public function commit_rejects_empty_records_array(): void
    {
        // NOTE: Laravel 'required' rule rejects empty arrays.
        // Service layer supports empty records for branch wipe (test B8),
        // but HTTP validation blocks it. Client uses DELETE endpoint instead.
        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => [],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['records']);
    }

    #[Test]
    public function commit_with_multiple_records_stores_all(): void
    {
        $records = [];
        for ($i = 0; $i < 5; $i++) {
            $records[] = ['timestamp' => 1000 + $i, 'text' => "Record {$i}"];
        }

        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => $records,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseCount('blackboards', 5);
    }

    #[Test]
    public function commit_with_file_hash_stores_attachment_reference(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => [
                ['timestamp' => 1000, 'text' => 'With file', 'file_hash' => 'abc123def456'],
            ],
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('blackboards', [
            'timestamp' => 1000,
            'file_hash' => 'abc123def456',
        ]);
    }

    // =========================================================================
    //  POST /api/blackboard/commit — auth guard
    // =========================================================================

    #[Test]
    public function commit_returns_401_when_unauthenticated(): void
    {
        $response = $this->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => [
                ['timestamp' => 1000, 'text' => 'Hello'],
            ],
        ]);

        $response->assertStatus(401);
        $this->assertDatabaseCount('blackboards', 0);
    }

    // =========================================================================
    //  POST /api/blackboard/commit — validation
    // =========================================================================

    #[Test]
    public function commit_rejects_missing_branch_id(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_name' => 'Main',
            'records' => [
                ['timestamp' => 1000, 'text' => 'Hello'],
            ],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['branch_id']);
    }

    #[Test]
    public function commit_rejects_missing_branch_name(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'records' => [
                ['timestamp' => 1000, 'text' => 'Hello'],
            ],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['branch_name']);
    }

    #[Test]
    public function commit_rejects_missing_records(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['records']);
    }

    #[Test]
    public function commit_rejects_records_exceeding_max_1000(): void
    {
        $records = [];
        for ($i = 0; $i < 1001; $i++) {
            $records[] = ['timestamp' => $i, 'text' => "Record {$i}"];
        }

        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => $records,
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['records']);
    }

    #[Test]
    public function commit_rejects_record_without_timestamp(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => [
                ['text' => 'No timestamp'],
            ],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['records.0.timestamp']);
    }

    #[Test]
    public function commit_rejects_non_integer_timestamp(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => [
                ['timestamp' => 'not-a-number', 'text' => 'Bad timestamp'],
            ],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['records.0.timestamp']);
    }

    #[Test]
    public function commit_rejects_device_id_exceeding_max_length(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => [
                ['timestamp' => 1000, 'text' => 'Hello'],
            ],
            'device_id' => str_repeat('x', 65),
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['device_id']);
    }

    #[Test]
    public function commit_accepts_nullable_text_with_file_hash(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => [
                ['timestamp' => 1000, 'text' => null, 'file_hash' => 'somehash'],
            ],
        ]);

        $response->assertStatus(200);
    }

    #[Test]
    public function commit_accepts_records_at_exact_max_1000(): void
    {
        $records = [];
        for ($i = 0; $i < 1000; $i++) {
            $records[] = ['timestamp' => $i, 'text' => "R{$i}"];
        }

        $response = $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'records' => $records,
        ]);

        $response->assertStatus(200);
    }

    // =========================================================================
    //  GET /api/blackboard/branches — happy path
    // =========================================================================

    #[Test]
    public function fetch_branches_returns_json_with_branches_key(): void
    {
        DB::table('blackboards')->insert([
            'user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main',
            'timestamp' => 1000, 'text' => 'Hello', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->user)->getJson('/api/blackboard/branches');

        $response->assertStatus(200)
            ->assertJsonStructure(['branches'])
            ->assertJsonCount(1, 'branches');
    }

    #[Test]
    public function fetch_branches_returns_correct_fields(): void
    {
        DB::table('blackboards')->insert([
            'user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main',
            'timestamp' => 5000, 'text' => 'Latest', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->user)->getJson('/api/blackboard/branches');

        $response->assertStatus(200);
        $branch = $response->json('branches.0');
        $this->assertEquals('br1', $branch['branch_id']);
        $this->assertEquals('Main', $branch['branch_name']);
        $this->assertEquals('bb-tester', $branch['uid']);
        $this->assertEquals(5000, $branch['last_update']);
    }

    #[Test]
    public function fetch_branches_ordered_by_last_update_desc(): void
    {
        DB::table('blackboards')->insert([
            ['user_id' => $this->user->id, 'branch_id' => 'old', 'branch_name' => 'Old', 'timestamp' => 1000, 'text' => 'A', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->user->id, 'branch_id' => 'new', 'branch_name' => 'New', 'timestamp' => 9000, 'text' => 'B', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $response = $this->actingAs($this->user)->getJson('/api/blackboard/branches');

        $branches = $response->json('branches');
        $this->assertEquals('new', $branches[0]['branch_id']);
        $this->assertEquals('old', $branches[1]['branch_id']);
    }

    // =========================================================================
    //  GET /api/blackboard/branches — unauthenticated (graceful degradation)
    // =========================================================================

    #[Test]
    public function fetch_branches_returns_empty_array_when_unauthenticated(): void
    {
        DB::table('blackboards')->insert([
            'user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main',
            'timestamp' => 1000, 'text' => 'Secret', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->getJson('/api/blackboard/branches');

        $response->assertStatus(200)
            ->assertJson(['branches' => []]);
    }

    // =========================================================================
    //  GET /api/blackboard/branches/{branchId} — happy path
    // =========================================================================

    #[Test]
    public function fetch_branch_details_returns_records(): void
    {
        DB::table('blackboards')->insert([
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 2000, 'text' => 'Second', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 1000, 'text' => 'First', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $response = $this->actingAs($this->user)->getJson('/api/blackboard/branches/br1');

        $response->assertStatus(200)
            ->assertJsonStructure(['records'])
            ->assertJsonCount(2, 'records');

        // Verify ascending timestamp order
        $records = $response->json('records');
        $this->assertEquals(1000, $records[0]['timestamp']);
        $this->assertEquals(2000, $records[1]['timestamp']);
    }

    #[Test]
    public function fetch_branch_details_returns_record_fields(): void
    {
        // Insert files row so the fetch filter keeps the hash (otherwise it
        // would be stripped as "blob not on server"); see A5 hash availability
        // filter in BlackboardService::stripUnavailableFileHashes.
        \App\Models\File::create([
            'hash' => 'hash123', 'user_id' => $this->user->id,
            'original_name' => 'doc.txt', 'mime_type' => 'text/plain',
            'size' => 10, 'disk_path' => 'files/ha/sh/hash123.txt',
            'status' => 'committed',
        ]);

        DB::table('blackboards')->insert([
            'user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main',
            'timestamp' => 1000, 'text' => 'Content here', 'file_hash' => 'hash123',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->user)->getJson('/api/blackboard/branches/br1');

        $record = $response->json('records.0');
        $this->assertEquals(1000, $record['timestamp']);
        $this->assertEquals('Content here', $record['text']);
        $this->assertEquals('hash123', $record['file_hash']);
        $this->assertEquals('bb-tester', $record['uid']);
    }

    #[Test]
    public function fetch_branch_details_strips_file_hash_when_blob_unavailable(): void
    {
        // Record references a hash that has no files row → fetch should hide
        // the chip by setting file_hash to null. Otherwise the user would see
        // a phantom chip that 404s on download.
        DB::table('blackboards')->insert([
            'user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main',
            'timestamp' => 1000, 'text' => 'Has phantom file', 'file_hash' => 'phantom_hash',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->user)->getJson('/api/blackboard/branches/br1');

        $record = $response->json('records.0');
        $this->assertEquals('Has phantom file', $record['text']);
        $this->assertNull($record['file_hash']);
    }

    #[Test]
    public function fetch_branch_details_strips_orphaned_file_hash(): void
    {
        // Orphaned files are about to be cleaned up — fetch should hide them.
        \App\Models\File::create([
            'hash' => 'orphan_hash', 'user_id' => $this->user->id,
            'original_name' => 'old.txt', 'mime_type' => 'text/plain',
            'size' => 10, 'disk_path' => 'files/or/ph/orphan_hash.txt',
            'status' => 'orphaned',
        ]);
        DB::table('blackboards')->insert([
            'user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main',
            'timestamp' => 1000, 'text' => 'Orphan ref', 'file_hash' => 'orphan_hash',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->user)->getJson('/api/blackboard/branches/br1');

        $record = $response->json('records.0');
        $this->assertNull($record['file_hash']);
    }

    // =========================================================================
    //  GET /api/blackboard/branches/{branchId} — auth & access control
    // =========================================================================

    #[Test]
    public function fetch_branch_details_returns_401_when_unauthenticated(): void
    {
        $response = $this->getJson('/api/blackboard/branches/br1');
        $response->assertStatus(401);
    }

    #[Test]
    public function fetch_branch_details_returns_empty_for_other_users_branch(): void
    {
        $other = User::factory()->create(['uid' => 'other-user']);
        DB::table('blackboards')->insert([
            'user_id' => $other->id, 'branch_id' => 'br1', 'branch_name' => 'Secret',
            'timestamp' => 1000, 'text' => 'Private data', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->user)->getJson('/api/blackboard/branches/br1');

        $response->assertStatus(200)
            ->assertJson(['records' => []]);
    }

    #[Test]
    public function fetch_branch_details_returns_empty_for_nonexistent_branch(): void
    {
        $response = $this->actingAs($this->user)->getJson('/api/blackboard/branches/nonexistent');

        $response->assertStatus(200)
            ->assertJson(['records' => []]);
    }

    // =========================================================================
    //  DELETE /api/blackboard/branches/{branchId} — happy path
    // =========================================================================

    #[Test]
    public function destroy_branch_deletes_records_and_returns_success(): void
    {
        DB::table('blackboards')->insert([
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 1000, 'text' => 'A', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main', 'timestamp' => 2000, 'text' => 'B', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $response = $this->actingAs($this->user)->deleteJson('/api/blackboard/branches/br1');

        $response->assertStatus(200)
            ->assertJson(['message' => 'Remote branch deleted']);
        $this->assertDatabaseCount('blackboards', 0);
    }

    #[Test]
    public function destroy_branch_does_not_affect_other_users_data(): void
    {
        $other = User::factory()->create(['uid' => 'other-user']);
        DB::table('blackboards')->insert([
            ['user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Mine', 'timestamp' => 1000, 'text' => 'Mine', 'created_at' => now(), 'updated_at' => now()],
            ['user_id' => $other->id, 'branch_id' => 'br1', 'branch_name' => 'Theirs', 'timestamp' => 2000, 'text' => 'Theirs', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->actingAs($this->user)->deleteJson('/api/blackboard/branches/br1');

        $this->assertDatabaseHas('blackboards', ['user_id' => $other->id, 'text' => 'Theirs']);
        $this->assertDatabaseMissing('blackboards', ['user_id' => $this->user->id]);
    }

    // =========================================================================
    //  DELETE /api/blackboard/branches/{branchId} — auth guard
    // =========================================================================

    #[Test]
    public function destroy_branch_returns_401_when_unauthenticated(): void
    {
        $response = $this->deleteJson('/api/blackboard/branches/br1');
        $response->assertStatus(401);
    }

    #[Test]
    public function destroy_nonexistent_branch_still_returns_success(): void
    {
        $response = $this->actingAs($this->user)->deleteJson('/api/blackboard/branches/ghost');

        $response->assertStatus(200)
            ->assertJson(['message' => 'Remote branch deleted']);
    }

    // =========================================================================
    //  End-to-end: commit then fetch round-trip
    // =========================================================================

    #[Test]
    public function commit_then_fetch_round_trip(): void
    {
        // Commit via HTTP
        $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'round-trip',
            'branch_name' => 'Test Branch',
            'records' => [
                ['timestamp' => 100, 'text' => 'First'],
                ['timestamp' => 200, 'text' => 'Second'],
                ['timestamp' => 300, 'text' => 'Third'],
            ],
        ])->assertStatus(200);

        // Fetch branches — should see the branch
        $branchesResponse = $this->actingAs($this->user)->getJson('/api/blackboard/branches');
        $branchesResponse->assertStatus(200)
            ->assertJsonCount(1, 'branches');
        $this->assertEquals('round-trip', $branchesResponse->json('branches.0.branch_id'));
        $this->assertEquals(300, $branchesResponse->json('branches.0.last_update'));

        // Fetch details — should see 3 records in order
        $detailsResponse = $this->actingAs($this->user)->getJson('/api/blackboard/branches/round-trip');
        $detailsResponse->assertStatus(200)
            ->assertJsonCount(3, 'records');
        $this->assertEquals('First', $detailsResponse->json('records.0.text'));
        $this->assertEquals('Third', $detailsResponse->json('records.2.text'));
    }

    #[Test]
    public function commit_then_destroy_round_trip(): void
    {
        // Commit
        $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'doomed',
            'branch_name' => 'Doomed Branch',
            'records' => [
                ['timestamp' => 1000, 'text' => 'Temporary'],
            ],
        ])->assertStatus(200);

        $this->assertDatabaseCount('blackboards', 1);

        // Destroy
        $this->actingAs($this->user)->deleteJson('/api/blackboard/branches/doomed')
            ->assertStatus(200);

        $this->assertDatabaseCount('blackboards', 0);

        // Fetch branches — should be empty
        $response = $this->actingAs($this->user)->getJson('/api/blackboard/branches');
        $response->assertJsonCount(0, 'branches');
    }

    #[Test]
    public function lww_commit_replaces_missing_records_via_http(): void
    {
        // First commit: 3 records
        $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'lww',
            'branch_name' => 'LWW Test',
            'records' => [
                ['timestamp' => 1000, 'text' => 'A'],
                ['timestamp' => 2000, 'text' => 'B'],
                ['timestamp' => 3000, 'text' => 'C'],
            ],
        ])->assertStatus(200);

        $this->assertDatabaseCount('blackboards', 3);

        // Second commit: only timestamp 2000 — 1000 and 3000 should be deleted
        $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'lww',
            'branch_name' => 'LWW Test',
            'records' => [
                ['timestamp' => 2000, 'text' => 'B updated'],
            ],
        ])->assertStatus(200);

        $this->assertDatabaseCount('blackboards', 1);
        $this->assertDatabaseHas('blackboards', ['timestamp' => 2000, 'text' => 'B updated']);
        $this->assertDatabaseMissing('blackboards', ['timestamp' => 1000]);
        $this->assertDatabaseMissing('blackboards', ['timestamp' => 3000]);
    }
}
