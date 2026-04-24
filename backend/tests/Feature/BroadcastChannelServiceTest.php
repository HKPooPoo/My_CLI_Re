<?php

namespace Tests\Feature;

use App\Events\BroadcastChannelUpdated;
use App\Models\User;
use App\Services\BroadcastChannelService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\Test;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class BroadcastChannelServiceTest extends TestCase
{
    use RefreshDatabase;

    private BroadcastChannelService $service;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->service = app(BroadcastChannelService::class);
        $this->admin = User::factory()->withTitle('ADMIN')->create(['uid' => 'admin']);
    }

    private function createChannel(string $name = 'general', ?User $owner = null): int
    {
        $owner ??= $this->admin;
        return DB::table('broadcast_channels')->insertGetId([
            'name' => $name,
            'user_id' => $owner->id,
            'last_signal' => 1000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    // =========================================================================
    //  cast() — create new channel
    // =========================================================================

    #[Test] /* C1 */
    public function cast_creates_new_channel(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);

        $channel = $this->service->cast($this->admin, 'news', [
            ['timestamp' => 1000, 'text' => 'Breaking news'],
        ]);

        $this->assertEquals('news', $channel->name);
        $this->assertEquals($this->admin->id, $channel->user_id);
        $this->assertDatabaseHas('broadcast_boards', ['channel_id' => $channel->id, 'text' => 'Breaking news']);
    }

    #[Test] /* C2 */
    public function cast_replaces_all_records_on_existing_channel(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);

        $channelId = $this->createChannel('news');
        DB::table('broadcast_boards')->insert([
            ['channel_id' => $channelId, 'timestamp' => 1000, 'text' => 'Old', 'created_at' => now(), 'updated_at' => now()],
            ['channel_id' => $channelId, 'timestamp' => 2000, 'text' => 'Old2', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->service->cast($this->admin, 'news', [
            ['timestamp' => 3000, 'text' => 'New content'],
        ]);

        $boards = DB::table('broadcast_boards')->where('channel_id', $channelId)->get();
        $this->assertCount(1, $boards);
        $this->assertEquals('New content', $boards[0]->text);
    }

    #[Test] /* C3 */
    public function cast_requires_title(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $noTitle = User::factory()->create(['uid' => 'pleb']);

        $this->expectException(HttpException::class);
        $this->service->cast($noTitle, 'test', [['timestamp' => 1000, 'text' => 'Hi']]);
    }

    #[Test] /* C4 */
    public function cast_rejects_non_owner(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $other = User::factory()->withTitle('MOD')->create(['uid' => 'other']);
        $this->createChannel('news'); // owned by admin

        $this->expectException(HttpException::class);
        $this->service->cast($other, 'news', [['timestamp' => 1000, 'text' => 'Hijack']]);
    }

    #[Test] /* C5 */
    public function cast_broadcasts_event(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);

        $this->service->cast($this->admin, 'news', [
            ['timestamp' => 1000, 'text' => 'Hello'],
        ]);

        Event::assertDispatched(BroadcastChannelUpdated::class, function ($e) {
            return $e->name === 'news' && $e->ownerUid === 'admin' && $e->action === 'cast';
        });
    }

    #[Test] /* C5b */
    public function cast_skips_blank_records(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);

        $this->service->cast($this->admin, 'news', [
            ['timestamp' => 1000, 'text' => ''],
            ['timestamp' => 2000, 'text' => 'Real content'],
        ]);

        $channel = DB::table('broadcast_channels')->where('name', 'news')->first();
        $boards = DB::table('broadcast_boards')->where('channel_id', $channel->id)->get();
        $this->assertCount(1, $boards);
    }

    // =========================================================================
    //  rename()
    // =========================================================================

    #[Test] /* C6 */
    public function rename_updates_channel_name(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $channelId = $this->createChannel('old-name');

        $this->service->rename($this->admin, $channelId, 'new-name');

        $this->assertDatabaseHas('broadcast_channels', ['id' => $channelId, 'name' => 'new-name']);
        Event::assertDispatched(BroadcastChannelUpdated::class, fn($e) =>
            $e->name === 'new-name' && $e->action === 'rename'
        );
    }

    #[Test] /* C7 */
    public function rename_rejects_duplicate_name(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $this->createChannel('taken');
        $channelId = $this->createChannel('original');

        $this->expectException(HttpException::class);
        $this->service->rename($this->admin, $channelId, 'taken');
    }

    #[Test] /* C8 */
    public function rename_rejects_non_owner(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $other = User::factory()->withTitle('MOD')->create(['uid' => 'other']);
        $channelId = $this->createChannel('news');

        $this->expectException(HttpException::class);
        $this->service->rename($other, $channelId, 'hijacked');
    }

    // =========================================================================
    //  destroy()
    // =========================================================================

    #[Test] /* C9 */
    public function destroy_deletes_channel_boards_and_pins(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $channelId = $this->createChannel('doomed');

        DB::table('broadcast_boards')->insert([
            'channel_id' => $channelId, 'timestamp' => 1000, 'text' => 'Gone',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('broadcast_pins')->insert([
            'user_id' => $this->admin->id, 'channel_id' => $channelId,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->service->destroy($this->admin, $channelId);

        $this->assertDatabaseMissing('broadcast_channels', ['id' => $channelId]);
        $this->assertDatabaseCount('broadcast_boards', 0);
        $this->assertDatabaseCount('broadcast_pins', 0);
        Event::assertDispatched(BroadcastChannelUpdated::class, fn($e) =>
            $e->action === 'destroy' && $e->lastSignal === 0
        );
    }

    #[Test] /* C10 */
    public function destroy_rejects_non_owner(): void
    {
        Event::fake([BroadcastChannelUpdated::class]);
        $other = User::factory()->withTitle('MOD')->create(['uid' => 'other']);
        $channelId = $this->createChannel('safe');

        $this->expectException(HttpException::class);
        $this->service->destroy($other, $channelId);
    }

    // =========================================================================
    //  fetchBoards()
    // =========================================================================

    #[Test] /* C11 */
    public function fetch_boards_returns_records_ordered_by_timestamp(): void
    {
        $channelId = $this->createChannel('news');
        DB::table('broadcast_boards')->insert([
            ['channel_id' => $channelId, 'timestamp' => 3000, 'text' => 'Third', 'created_at' => now(), 'updated_at' => now()],
            ['channel_id' => $channelId, 'timestamp' => 1000, 'text' => 'First', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $boards = $this->service->fetchBoards($channelId);

        $this->assertCount(2, $boards);
        $this->assertEquals(1000, $boards[0]->timestamp);
        $this->assertEquals(3000, $boards[1]->timestamp);
    }

    #[Test] /* C12 */
    public function fetch_boards_returns_empty_for_nonexistent_channel(): void
    {
        $boards = $this->service->fetchBoards(9999);
        $this->assertEmpty($boards);
    }

    // =========================================================================
    //  listChannels()
    // =========================================================================

    #[Test] /* C13 */
    public function list_channels_returns_pinned_first(): void
    {
        $ch1 = $this->createChannel('older');
        $ch2 = $this->createChannel('newer');
        DB::table('broadcast_channels')->where('id', $ch2)->update(['last_signal' => 9999]);

        // Pin the older channel
        DB::table('broadcast_pins')->insert([
            'user_id' => $this->admin->id, 'channel_id' => $ch1,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $channels = $this->service->listChannels($this->admin);

        $this->assertCount(2, $channels);
        $this->assertEquals('older', $channels[0]['name']); // pinned, comes first
        $this->assertTrue($channels[0]['is_pinned']);
        $this->assertFalse($channels[1]['is_pinned']);
    }

    #[Test] /* C14 */
    public function list_channels_works_for_guest(): void
    {
        $this->createChannel('public');

        $channels = $this->service->listChannels(null);

        $this->assertCount(1, $channels);
        $this->assertFalse($channels[0]['is_pinned']);
    }

    // =========================================================================
    //  pin() / unpin()
    // =========================================================================

    #[Test] /* C15 */
    public function pin_creates_pin_record(): void
    {
        $channelId = $this->createChannel('fav');

        $this->service->pin($this->admin, $channelId);

        $this->assertDatabaseHas('broadcast_pins', [
            'user_id' => $this->admin->id,
            'channel_id' => $channelId,
        ]);
    }

    #[Test] /* C16 */
    public function pin_is_idempotent(): void
    {
        $channelId = $this->createChannel('fav');

        $this->service->pin($this->admin, $channelId);
        $this->service->pin($this->admin, $channelId); // second pin should not throw

        $count = DB::table('broadcast_pins')
            ->where('user_id', $this->admin->id)
            ->where('channel_id', $channelId)
            ->count();
        $this->assertEquals(1, $count);
    }

    #[Test] /* C17 */
    public function unpin_removes_pin_record(): void
    {
        $channelId = $this->createChannel('fav');
        DB::table('broadcast_pins')->insert([
            'user_id' => $this->admin->id, 'channel_id' => $channelId,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->service->unpin($this->admin, $channelId);

        $this->assertDatabaseMissing('broadcast_pins', [
            'user_id' => $this->admin->id,
            'channel_id' => $channelId,
        ]);
    }

    #[Test] /* C18 */
    public function pin_rejects_nonexistent_channel(): void
    {
        $this->expectException(HttpException::class);
        $this->service->pin($this->admin, 9999);
    }

    // =========================================================================
    //  cast() — calendar bundle (Tier 9c sanity)
    // =========================================================================

    #[Test] /* C19 */
    public function cast_persists_calendar_when_provided(): void
    {
        $calendar = ['2026-05-01' => ['Midterm']];

        $channel = $this->service->cast(
            $this->admin, 'classroom', [['timestamp' => 1000, 'text' => 'hi']], $calendar
        );

        $stored = DB::table('broadcast_channels')->where('id', $channel->id)->value('calendar');
        $this->assertEquals($calendar, json_decode($stored, true));
    }

    #[Test] /* C20 */
    public function cast_keeps_existing_calendar_when_omitted(): void
    {
        // First cast writes calendar.
        $first = $this->service->cast(
            $this->admin, 'classroom', [['timestamp' => 1000, 'text' => 'a']],
            ['2026-05-01' => ['Midterm']]
        );

        // Second cast omits calendar → existing value must survive.
        $this->service->cast(
            $this->admin, 'classroom', [['timestamp' => 2000, 'text' => 'b']]
        );

        $stored = DB::table('broadcast_channels')->where('id', $first->id)->value('calendar');
        $this->assertEquals(['2026-05-01' => ['Midterm']], json_decode($stored, true));
    }

    // =========================================================================
    //  cast() — flashcards bundle (Tier 9e)
    // =========================================================================

    #[Test] /* C21 */
    public function cast_persists_flashcards_when_provided(): void
    {
        $deck = [
            'cards' => [
                ['front' => 'HTTP', 'back' => 'Hypertext Transfer Protocol'],
                ['front' => 'DNS',  'back' => 'Domain Name System'],
            ],
            'mode' => 'sequential',
            'playState' => ['currentIdx' => 0, 'face' => 'front', 'randomHistory' => []],
        ];

        $channel = $this->service->cast(
            $this->admin, 'net101', [['timestamp' => 1000, 'text' => 'hi']], null, $deck
        );

        $stored = DB::table('broadcast_channels')->where('id', $channel->id)->value('flashcards');
        $this->assertEquals($deck, json_decode($stored, true));
    }

    #[Test] /* C22 */
    public function cast_keeps_existing_flashcards_when_omitted(): void
    {
        $deck = ['cards' => [['front' => 'a', 'back' => 'b']], 'mode' => 'random'];

        $first = $this->service->cast(
            $this->admin, 'deckchannel', [['timestamp' => 1000, 'text' => 'x']], null, $deck
        );

        // Second cast omits flashcards → must NOT wipe the stored deck.
        $this->service->cast(
            $this->admin, 'deckchannel', [['timestamp' => 2000, 'text' => 'y']]
        );

        $stored = DB::table('broadcast_channels')->where('id', $first->id)->value('flashcards');
        $this->assertEquals($deck, json_decode($stored, true));
    }

    #[Test] /* C23 */
    public function cast_updates_flashcards_on_resubmit(): void
    {
        $first = $this->service->cast(
            $this->admin, 'deckchannel', [['timestamp' => 1000, 'text' => 'x']],
            null, ['cards' => [['front' => 'old', 'back' => 'deck']], 'mode' => 'sequential']
        );

        $newDeck = ['cards' => [['front' => 'new', 'back' => 'deck']], 'mode' => 'random'];

        $this->service->cast(
            $this->admin, 'deckchannel', [['timestamp' => 2000, 'text' => 'y']], null, $newDeck
        );

        $stored = DB::table('broadcast_channels')->where('id', $first->id)->value('flashcards');
        $this->assertEquals($newDeck, json_decode($stored, true));
    }

    #[Test] /* C24 */
    public function get_flashcards_returns_empty_when_missing(): void
    {
        $channelId = $this->createChannel();
        $this->assertEquals([], $this->service->getFlashcards($channelId));
    }

    #[Test] /* C25 */
    public function get_flashcards_returns_stored_value(): void
    {
        $deck = [
            'cards' => [['front' => 'a', 'back' => 'b']],
            'mode' => 'sequential',
            'playState' => ['currentIdx' => 0, 'face' => 'front', 'randomHistory' => []],
        ];

        $this->service->cast(
            $this->admin, 'ch', [['timestamp' => 1000, 'text' => 'x']], null, $deck
        );
        $channel = DB::table('broadcast_channels')->where('name', 'ch')->first();

        $this->assertEquals($deck, $this->service->getFlashcards($channel->id));
    }

    #[Test] /* C26 */
    public function get_flashcards_returns_empty_for_nonexistent_channel(): void
    {
        $this->assertEquals([], $this->service->getFlashcards(99999));
    }
}
