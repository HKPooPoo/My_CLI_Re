<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\WhitelistService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Whitelist visibility gating across the broadcast HTTP surface.
 * Truth table:
 *
 *                            | public ch | private ch (member) | private ch (non-member)
 *   guest                    |   200     |        403/[]       |         403/[]
 *   member uid               |   200     |          200        |          —
 *   non-member               |   200     |           —         |         403/[]
 *   owner                    |   200     |          200        |          —
 *
 * "—" means situation impossible (member contradicts non-member).
 * /channels index returns the row for visible channels and silently
 * omits hidden ones (it's the caller's view of the world); the
 * single-channel endpoints return 403 on hidden access.
 */
class BroadcastWhitelistGatingTest extends TestCase
{
    use RefreshDatabase;

    private WhitelistService $whitelistService;
    private User $owner;
    private User $member;
    private User $nonMember;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->whitelistService = app(WhitelistService::class);
        $this->owner     = User::factory()->withTitle('Faculty')->create(['uid' => 'teacher_alice']);
        $this->member    = User::factory()->withTitle('Student')->create(['uid' => 'student_bob']);
        $this->nonMember = User::factory()->withTitle('Student')->create(['uid' => 'student_eve']);
    }

    private function createChannel(string $name, User $owner, ?int $whitelistId = null): int
    {
        return DB::table('broadcast_channels')->insertGetId([
            'name'         => $name,
            'user_id'      => $owner->id,
            'last_signal'  => 1000,
            'whitelist_id' => $whitelistId,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
    }

    private function createPrivateChannel(string $name, User $owner, array $members = []): array
    {
        // Deterministic compliant-format code per channel name so each test
        // gets a unique whitelist without colliding inside RefreshDatabase.
        $code = '2026SEHH' . sprintf('%04d', abs(crc32($name)) % 10000);
        $displayName = "{$code} Test {$name}";
        // displayName must match /^\d{4} [A-Z]+\d+ .+$/ — split year out:
        $displayName = '2026 ' . substr($code, 4) . ' Test ' . $name;
        $whitelistId = $this->whitelistService->create($code, $displayName);
        foreach ($members as $uid) {
            $this->whitelistService->addMember($whitelistId, $uid);
        }
        $channelId = $this->createChannel($name, $owner, $whitelistId);
        return [$channelId, $whitelistId];
    }

    // =========================================================================
    //  GET /api/broadcast/channels — index filters hidden rows
    // =========================================================================

    #[Test]
    public function index_omits_private_channel_for_non_member(): void
    {
        $publicId = $this->createChannel('public_ch', $this->owner);
        [$privateId,] = $this->createPrivateChannel('private_ch', $this->owner, ['student_bob']);

        $r = $this->actingAs($this->nonMember)->getJson('/api/broadcast/channels');
        $r->assertStatus(200);

        $ids = collect($r->json('channels'))->pluck('id')->all();
        $this->assertContains($publicId, $ids);
        $this->assertNotContains($privateId, $ids);
    }

    #[Test]
    public function index_includes_private_channel_for_member(): void
    {
        [$privateId,] = $this->createPrivateChannel('private_ch', $this->owner, ['student_bob']);

        $r = $this->actingAs($this->member)->getJson('/api/broadcast/channels');
        $r->assertStatus(200);

        $ids = collect($r->json('channels'))->pluck('id')->all();
        $this->assertContains($privateId, $ids);
    }

    #[Test]
    public function index_includes_private_channel_for_owner_even_without_membership(): void
    {
        // Owner is NOT in the members list — but owner privilege overrides
        [$privateId,] = $this->createPrivateChannel('private_ch', $this->owner, ['student_bob']);

        $r = $this->actingAs($this->owner)->getJson('/api/broadcast/channels');
        $r->assertStatus(200);

        $ids = collect($r->json('channels'))->pluck('id')->all();
        $this->assertContains($privateId, $ids);
    }

    #[Test]
    public function index_hides_private_channel_from_guest(): void
    {
        [$privateId,] = $this->createPrivateChannel('private_ch', $this->owner, ['student_bob']);

        $r = $this->getJson('/api/broadcast/channels');
        $r->assertStatus(200);

        $ids = collect($r->json('channels'))->pluck('id')->all();
        $this->assertNotContains($privateId, $ids);
    }

    // =========================================================================
    //  Single-channel reads — boards / calendar / flashcards
    // =========================================================================

    #[Test]
    public function fetch_boards_returns_403_for_non_member(): void
    {
        [$id,] = $this->createPrivateChannel('private_ch', $this->owner, ['student_bob']);

        $r = $this->actingAs($this->nonMember)->getJson("/api/broadcast/channels/{$id}/boards");
        $r->assertStatus(403);
    }

    #[Test]
    public function fetch_boards_succeeds_for_member(): void
    {
        [$id,] = $this->createPrivateChannel('private_ch', $this->owner, ['student_bob']);

        $r = $this->actingAs($this->member)->getJson("/api/broadcast/channels/{$id}/boards");
        $r->assertStatus(200);
    }

    #[Test]
    public function fetch_boards_succeeds_for_owner_without_membership(): void
    {
        [$id,] = $this->createPrivateChannel('private_ch', $this->owner, ['student_bob']);

        $r = $this->actingAs($this->owner)->getJson("/api/broadcast/channels/{$id}/boards");
        $r->assertStatus(200);
    }

    #[Test]
    public function calendar_returns_403_for_non_member(): void
    {
        [$id,] = $this->createPrivateChannel('private_ch', $this->owner, ['student_bob']);

        $r = $this->actingAs($this->nonMember)->getJson("/api/broadcast/channels/{$id}/calendar");
        $r->assertStatus(403);
    }

    #[Test]
    public function flashcards_returns_403_for_non_member(): void
    {
        [$id,] = $this->createPrivateChannel('private_ch', $this->owner, ['student_bob']);

        $r = $this->actingAs($this->nonMember)->getJson("/api/broadcast/channels/{$id}/flashcards");
        $r->assertStatus(403);
    }

    #[Test]
    public function pin_returns_403_for_non_member(): void
    {
        [$id,] = $this->createPrivateChannel('private_ch', $this->owner, ['student_bob']);

        $r = $this->actingAs($this->nonMember)->postJson("/api/broadcast/channels/{$id}/pin");
        $r->assertStatus(403);
    }

    #[Test]
    public function pin_succeeds_for_member(): void
    {
        [$id,] = $this->createPrivateChannel('private_ch', $this->owner, ['student_bob']);

        $r = $this->actingAs($this->member)->postJson("/api/broadcast/channels/{$id}/pin");
        $r->assertStatus(200);
    }

    // =========================================================================
    //  PUT /api/broadcast/channels/{id}/whitelist — owner applies preset
    // =========================================================================

    #[Test]
    public function apply_whitelist_requires_auth(): void
    {
        $id = $this->createChannel('ch', $this->owner);
        $r = $this->putJson("/api/broadcast/channels/{$id}/whitelist", ['whitelist_id' => 1]);
        $r->assertStatus(401);
    }

    #[Test]
    public function apply_whitelist_rejects_non_owner(): void
    {
        $id = $this->createChannel('ch', $this->owner);
        $whitelistId = $this->whitelistService->create('2026SEHH8001', '2026 SEHH8001 Gating Test X');
        $this->whitelistService->addDistribution($whitelistId, 'rule', title: 'Faculty');

        $other = User::factory()->withTitle('Faculty')->create(['uid' => 'other_teacher']);
        $r = $this->actingAs($other)->putJson("/api/broadcast/channels/{$id}/whitelist", ['whitelist_id' => $whitelistId]);
        $r->assertStatus(403);
    }

    #[Test]
    public function apply_whitelist_rejects_owner_without_distribution_grant(): void
    {
        $id = $this->createChannel('ch', $this->owner);
        $whitelistId = $this->whitelistService->create('2026SEHH8001', '2026 SEHH8001 Gating Test X');
        // No distribution rule grants this owner the right to apply

        $r = $this->actingAs($this->owner)->putJson("/api/broadcast/channels/{$id}/whitelist", ['whitelist_id' => $whitelistId]);
        $r->assertStatus(403);
    }

    #[Test]
    public function apply_whitelist_succeeds_for_owner_with_grant(): void
    {
        $id = $this->createChannel('ch', $this->owner);
        $whitelistId = $this->whitelistService->create('2026SEHH8001', '2026 SEHH8001 Gating Test X');
        $this->whitelistService->addDistribution($whitelistId, 'rule', title: 'Faculty');

        $r = $this->actingAs($this->owner)->putJson("/api/broadcast/channels/{$id}/whitelist", ['whitelist_id' => $whitelistId]);
        $r->assertStatus(200);

        $this->assertEquals($whitelistId, DB::table('broadcast_channels')->where('id', $id)->value('whitelist_id'));
    }

    #[Test]
    public function apply_whitelist_null_detaches_back_to_public(): void
    {
        $whitelistId = $this->whitelistService->create('2026SEHH8001', '2026 SEHH8001 Gating Test X');
        $this->whitelistService->addDistribution($whitelistId, 'rule', title: 'Faculty');
        $id = $this->createChannel('ch', $this->owner, $whitelistId);

        $r = $this->actingAs($this->owner)->putJson("/api/broadcast/channels/{$id}/whitelist", ['whitelist_id' => null]);
        $r->assertStatus(200);

        $this->assertNull(DB::table('broadcast_channels')->where('id', $id)->value('whitelist_id'));
    }

    // =========================================================================
    //  GET /api/whitelists — applicant-filtered list
    // =========================================================================

    #[Test]
    public function whitelists_index_returns_empty_for_guest(): void
    {
        $this->whitelistService->create('2026SEHH8001', '2026 SEHH8001 Gating Test X');

        $r = $this->getJson('/api/whitelists');
        $r->assertStatus(200)->assertJson(['whitelists' => []]);
    }

    #[Test]
    public function whitelists_index_returns_empty_for_user_without_distribution(): void
    {
        $this->whitelistService->create('2026SEHH8001', '2026 SEHH8001 Gating Test X');

        $r = $this->actingAs($this->nonMember)->getJson('/api/whitelists');
        $r->assertStatus(200)->assertJson(['whitelists' => []]);
    }

    #[Test]
    public function whitelists_index_filters_by_user_distribution(): void
    {
        $idA = $this->whitelistService->create('2026SEHH8002', '2026 SEHH8002 Gating Test A');
        $idB = $this->whitelistService->create('2026SEHH8003', '2026 SEHH8003 Gating Test B');
        $this->whitelistService->create('2026SEHH8004', '2026 SEHH8004 Gating Test C'); // no grant

        $this->whitelistService->addDistribution($idA, 'r', title: 'Faculty');
        $this->whitelistService->addDistribution($idB, 'r', uid: 'teacher_alice');

        $r = $this->actingAs($this->owner)->getJson('/api/whitelists');
        $r->assertStatus(200);

        $codes = collect($r->json('whitelists'))->pluck('code')->sort()->values()->all();
        $this->assertEquals(['2026SEHH8002', '2026SEHH8003'], $codes);
    }

    #[Test]
    public function whitelists_index_does_not_leak_member_uids(): void
    {
        $idA = $this->whitelistService->create('2026SEHH8002', '2026 SEHH8002 Gating Test A');
        $this->whitelistService->addDistribution($idA, 'r', title: 'Faculty');
        $this->whitelistService->addMember($idA, 'student_bob');
        $this->whitelistService->addMember($idA, 'student_eve');

        $r = $this->actingAs($this->owner)->getJson('/api/whitelists');
        $r->assertStatus(200);
        $payload = $r->json('whitelists.0');

        $this->assertEquals(2, $payload['member_count']);
        $this->assertArrayNotHasKey('members', $payload);
    }
}
