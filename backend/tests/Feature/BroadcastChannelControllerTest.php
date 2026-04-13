<?php

namespace Tests\Feature;

use App\Events\BroadcastChannelUpdated;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class BroadcastChannelControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $titled;
    private User $untitled;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->titled = User::factory()->withTitle('ADMIN')->create(['uid' => 'admin']);
        $this->untitled = User::factory()->create(['uid' => 'reader']);
    }

    private function createChannel(string $name = 'general', ?User $owner = null): int
    {
        $owner ??= $this->titled;
        return DB::table('broadcast_channels')->insertGetId([
            'name' => $name,
            'user_id' => $owner->id,
            'last_signal' => (int) (microtime(true) * 1000),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    // =========================================================================
    //  GET /api/broadcast/channels (index) — public endpoint
    // =========================================================================

    #[Test]
    public function index_returns_channels_for_guest(): void
    {
        $this->createChannel('announcements');

        $response = $this->getJson('/api/broadcast/channels');

        $response->assertStatus(200)
            ->assertJsonStructure(['channels'])
            ->assertJsonCount(1, 'channels');
    }

    #[Test]
    public function index_returns_channels_for_authenticated_user(): void
    {
        $this->createChannel('news');

        $response = $this->actingAs($this->untitled)->getJson('/api/broadcast/channels');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'channels');
    }

    #[Test]
    public function index_shows_pinned_status_for_authenticated_user(): void
    {
        $chId = $this->createChannel('pinnable');
        DB::table('broadcast_pins')->insert([
            'user_id' => $this->untitled->id,
            'channel_id' => $chId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->untitled)->getJson('/api/broadcast/channels');

        $channel = $response->json('channels.0');
        $this->assertTrue($channel['is_pinned']);
    }

    #[Test]
    public function index_returns_empty_when_no_channels(): void
    {
        $response = $this->getJson('/api/broadcast/channels');

        $response->assertStatus(200)
            ->assertJson(['channels' => []]);
    }

    // =========================================================================
    //  POST /api/broadcast/channels/cast — happy path
    // =========================================================================

    #[Test]
    public function cast_creates_new_channel(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);

        $response = $this->actingAs($this->titled)->postJson('/api/broadcast/channels/cast', [
            'channel_name' => 'New Channel',
            'records' => [
                ['timestamp' => 1000, 'text' => 'First broadcast'],
            ],
        ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'CAST COMPLETE'])
            ->assertJsonStructure(['channel']);

        $this->assertDatabaseHas('broadcast_channels', ['name' => 'New Channel']);
        $this->assertDatabaseHas('broadcast_boards', ['text' => 'First broadcast']);
    }

    #[Test]
    public function cast_updates_existing_channel(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);

        // First cast
        $this->actingAs($this->titled)->postJson('/api/broadcast/channels/cast', [
            'channel_name' => 'Updates',
            'records' => [['timestamp' => 1000, 'text' => 'v1']],
        ]);

        // Second cast — LWW replaces all records
        $this->actingAs($this->titled)->postJson('/api/broadcast/channels/cast', [
            'channel_name' => 'Updates',
            'records' => [['timestamp' => 2000, 'text' => 'v2']],
        ]);

        // Only 1 channel, 1 record (LWW replaced)
        $this->assertEquals(1, DB::table('broadcast_channels')->count());
        $this->assertEquals(1, DB::table('broadcast_boards')->count());
        $this->assertDatabaseHas('broadcast_boards', ['text' => 'v2']);
        $this->assertDatabaseMissing('broadcast_boards', ['text' => 'v1']);
    }

    #[Test]
    public function cast_broadcasts_event(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);

        $this->actingAs($this->titled)->postJson('/api/broadcast/channels/cast', [
            'channel_name' => 'Event Test',
            'records' => [['timestamp' => 1000, 'text' => 'Hello']],
        ]);

        Event::assertDispatched(BroadcastChannelUpdated::class, function ($e) {
            return $e->name === 'Event Test'
                && $e->ownerUid === 'admin'
                && $e->action === 'cast';
        });
    }

    // =========================================================================
    //  POST /api/broadcast/channels/cast — guards & validation
    // =========================================================================

    #[Test]
    public function cast_returns_401_when_unauthenticated(): void
    {
        $response = $this->postJson('/api/broadcast/channels/cast', [
            'channel_name' => 'Test',
            'records' => [['timestamp' => 1000, 'text' => 'Hello']],
        ]);

        $response->assertStatus(401);
    }

    #[Test]
    public function cast_returns_403_for_untitled_user(): void
    {
        $response = $this->actingAs($this->untitled)->postJson('/api/broadcast/channels/cast', [
            'channel_name' => 'Test',
            'records' => [['timestamp' => 1000, 'text' => 'Hello']],
        ]);

        $response->assertStatus(403);
    }

    #[Test]
    public function cast_returns_403_for_non_owner(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $this->createChannel('Owned Channel');

        $other = User::factory()->withTitle('MOD')->create(['uid' => 'other-mod']);

        $response = $this->actingAs($other)->postJson('/api/broadcast/channels/cast', [
            'channel_name' => 'Owned Channel',
            'records' => [['timestamp' => 1000, 'text' => 'Hijack']],
        ]);

        $response->assertStatus(403);
    }

    #[Test]
    public function cast_rejects_missing_channel_name(): void
    {
        $response = $this->actingAs($this->titled)->postJson('/api/broadcast/channels/cast', [
            'records' => [['timestamp' => 1000, 'text' => 'Hello']],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['channel_name']);
    }

    #[Test]
    public function cast_rejects_missing_records(): void
    {
        $response = $this->actingAs($this->titled)->postJson('/api/broadcast/channels/cast', [
            'channel_name' => 'Test',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['records']);
    }

    #[Test]
    public function cast_rejects_record_without_timestamp(): void
    {
        $response = $this->actingAs($this->titled)->postJson('/api/broadcast/channels/cast', [
            'channel_name' => 'Test',
            'records' => [['text' => 'No timestamp']],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['records.0.timestamp']);
    }

    // =========================================================================
    //  PATCH /api/broadcast/channels/{id} (rename)
    // =========================================================================

    #[Test]
    public function rename_updates_channel_name(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $chId = $this->createChannel('Old Name');

        $response = $this->actingAs($this->titled)->patchJson("/api/broadcast/channels/{$chId}", [
            'name' => 'New Name',
        ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'RENAME COMPLETE']);

        $this->assertDatabaseHas('broadcast_channels', ['id' => $chId, 'name' => 'New Name']);
    }

    #[Test]
    public function rename_returns_401_when_unauthenticated(): void
    {
        $chId = $this->createChannel('Test');
        $response = $this->patchJson("/api/broadcast/channels/{$chId}", ['name' => 'New']);
        $response->assertStatus(401);
    }

    #[Test]
    public function rename_returns_403_for_non_owner(): void
    {
        $chId = $this->createChannel('Owned');
        $other = User::factory()->withTitle('MOD')->create(['uid' => 'other-mod']);

        $response = $this->actingAs($other)->patchJson("/api/broadcast/channels/{$chId}", [
            'name' => 'Stolen',
        ]);

        $response->assertStatus(403);
    }

    #[Test]
    public function rename_returns_409_for_duplicate_name(): void
    {
        $this->createChannel('Existing');
        $chId = $this->createChannel('Rename Me');

        $response = $this->actingAs($this->titled)->patchJson("/api/broadcast/channels/{$chId}", [
            'name' => 'Existing',
        ]);

        $response->assertStatus(409);
    }

    #[Test]
    public function rename_rejects_missing_name(): void
    {
        $chId = $this->createChannel('Test');

        $response = $this->actingAs($this->titled)->patchJson("/api/broadcast/channels/{$chId}", []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['name']);
    }

    // =========================================================================
    //  DELETE /api/broadcast/channels/{id} (destroy)
    // =========================================================================

    #[Test]
    public function destroy_deletes_channel_and_boards(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $chId = $this->createChannel('Doomed');
        DB::table('broadcast_boards')->insert([
            'channel_id' => $chId, 'timestamp' => 1000, 'text' => 'Gone',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->titled)->deleteJson("/api/broadcast/channels/{$chId}");

        $response->assertStatus(200)
            ->assertJson(['message' => 'DELETE COMPLETE']);

        $this->assertDatabaseCount('broadcast_channels', 0);
        $this->assertDatabaseCount('broadcast_boards', 0);
    }

    #[Test]
    public function destroy_deletes_associated_pins(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $chId = $this->createChannel('Pinned');
        DB::table('broadcast_pins')->insert([
            'user_id' => $this->untitled->id, 'channel_id' => $chId,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($this->titled)->deleteJson("/api/broadcast/channels/{$chId}");

        $this->assertDatabaseCount('broadcast_pins', 0);
    }

    #[Test]
    public function destroy_broadcasts_event(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $chId = $this->createChannel('Event Channel');

        $this->actingAs($this->titled)->deleteJson("/api/broadcast/channels/{$chId}");

        Event::assertDispatched(BroadcastChannelUpdated::class, function ($e) {
            return $e->action === 'destroy';
        });
    }

    #[Test]
    public function destroy_returns_401_when_unauthenticated(): void
    {
        $chId = $this->createChannel('Test');
        $response = $this->deleteJson("/api/broadcast/channels/{$chId}");
        $response->assertStatus(401);
    }

    #[Test]
    public function destroy_returns_403_for_non_owner(): void
    {
        $chId = $this->createChannel('Owned');
        $other = User::factory()->withTitle('MOD')->create();

        $response = $this->actingAs($other)->deleteJson("/api/broadcast/channels/{$chId}");
        $response->assertStatus(403);
    }

    #[Test]
    public function destroy_returns_404_for_nonexistent_channel(): void
    {
        $response = $this->actingAs($this->titled)->deleteJson('/api/broadcast/channels/99999');
        $response->assertStatus(404);
    }

    // =========================================================================
    //  GET /api/broadcast/channels/{id}/boards (fetchBoards) — public
    // =========================================================================

    #[Test]
    public function fetch_boards_returns_records(): void
    {
        $chId = $this->createChannel('News');
        DB::table('broadcast_boards')->insert([
            ['channel_id' => $chId, 'timestamp' => 2000, 'text' => 'Second', 'created_at' => now(), 'updated_at' => now()],
            ['channel_id' => $chId, 'timestamp' => 1000, 'text' => 'First', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $response = $this->getJson("/api/broadcast/channels/{$chId}/boards");

        $response->assertStatus(200)
            ->assertJsonCount(2, 'records');

        // Ordered by timestamp ASC
        $records = $response->json('records');
        $this->assertEquals(1000, $records[0]['timestamp']);
        $this->assertEquals(2000, $records[1]['timestamp']);
    }

    #[Test]
    public function fetch_boards_accessible_without_auth(): void
    {
        $chId = $this->createChannel('Public');
        DB::table('broadcast_boards')->insert([
            'channel_id' => $chId, 'timestamp' => 1000, 'text' => 'Public content',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->getJson("/api/broadcast/channels/{$chId}/boards");

        $response->assertStatus(200)
            ->assertJsonCount(1, 'records');
    }

    #[Test]
    public function fetch_boards_returns_empty_for_nonexistent_channel(): void
    {
        $response = $this->getJson('/api/broadcast/channels/99999/boards');

        $response->assertStatus(200)
            ->assertJson(['records' => []]);
    }

    // =========================================================================
    //  POST /api/broadcast/channels/{id}/pin & DELETE .../pin
    // =========================================================================

    #[Test]
    public function pin_creates_pin_record(): void
    {
        $chId = $this->createChannel('Pinnable');

        $response = $this->actingAs($this->untitled)->postJson("/api/broadcast/channels/{$chId}/pin");

        $response->assertStatus(200)
            ->assertJson(['message' => 'PINNED']);

        $this->assertDatabaseHas('broadcast_pins', [
            'user_id' => $this->untitled->id,
            'channel_id' => $chId,
        ]);
    }

    #[Test]
    public function pin_is_idempotent(): void
    {
        $chId = $this->createChannel('Double Pin');

        $this->actingAs($this->untitled)->postJson("/api/broadcast/channels/{$chId}/pin");
        $this->actingAs($this->untitled)->postJson("/api/broadcast/channels/{$chId}/pin");

        $count = DB::table('broadcast_pins')
            ->where('user_id', $this->untitled->id)
            ->where('channel_id', $chId)
            ->count();
        $this->assertEquals(1, $count);
    }

    #[Test]
    public function pin_returns_401_when_unauthenticated(): void
    {
        $chId = $this->createChannel('Test');
        $response = $this->postJson("/api/broadcast/channels/{$chId}/pin");
        $response->assertStatus(401);
    }

    #[Test]
    public function pin_returns_404_for_nonexistent_channel(): void
    {
        $response = $this->actingAs($this->untitled)->postJson('/api/broadcast/channels/99999/pin');
        $response->assertStatus(404);
    }

    #[Test]
    public function unpin_removes_pin_record(): void
    {
        $chId = $this->createChannel('Unpin Me');
        DB::table('broadcast_pins')->insert([
            'user_id' => $this->untitled->id, 'channel_id' => $chId,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->untitled)->deleteJson("/api/broadcast/channels/{$chId}/pin");

        $response->assertStatus(200)
            ->assertJson(['message' => 'UNPINNED']);

        $this->assertDatabaseMissing('broadcast_pins', [
            'user_id' => $this->untitled->id,
            'channel_id' => $chId,
        ]);
    }

    #[Test]
    public function unpin_returns_401_when_unauthenticated(): void
    {
        $chId = $this->createChannel('Test');
        $response = $this->deleteJson("/api/broadcast/channels/{$chId}/pin");
        $response->assertStatus(401);
    }

    // =========================================================================
    //  End-to-end: cast → fetch → pin → rename → destroy
    // =========================================================================

    #[Test]
    public function full_lifecycle_cast_fetch_pin_rename_destroy(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);

        // 1. Cast
        $castResponse = $this->actingAs($this->titled)->postJson('/api/broadcast/channels/cast', [
            'channel_name' => 'Lifecycle',
            'records' => [
                ['timestamp' => 1000, 'text' => 'Announcement 1'],
                ['timestamp' => 2000, 'text' => 'Announcement 2'],
            ],
        ]);
        $castResponse->assertStatus(200);
        $chId = $castResponse->json('channel.id');

        // 2. Fetch (public)
        $this->getJson("/api/broadcast/channels/{$chId}/boards")
            ->assertJsonCount(2, 'records');

        // 3. Pin (as reader)
        $this->actingAs($this->untitled)->postJson("/api/broadcast/channels/{$chId}/pin")
            ->assertStatus(200);

        // 4. Rename
        $this->actingAs($this->titled)->patchJson("/api/broadcast/channels/{$chId}", [
            'name' => 'Lifecycle Renamed',
        ])->assertStatus(200);

        $this->assertDatabaseHas('broadcast_channels', ['name' => 'Lifecycle Renamed']);

        // 5. Destroy
        $this->actingAs($this->titled)->deleteJson("/api/broadcast/channels/{$chId}")
            ->assertStatus(200);

        $this->assertDatabaseCount('broadcast_channels', 0);
        $this->assertDatabaseCount('broadcast_boards', 0);
        $this->assertDatabaseCount('broadcast_pins', 0);
    }
}
