<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Whitelist + Distribution registry.
 *
 *   whitelists                 (T2) → the audience set
 *     id, code, name, description, members(jsonb)
 *
 *   whitelist_distributions    (T1) → the access-to-apply rules
 *     id, name, description, whitelist_id (FK),
 *     title (nullable), uid (nullable)
 *
 * Two distinct privileges:
 *   - "Can a viewer SEE a channel that has whitelist X applied?"
 *     ⇒ check viewer.uid ∈ whitelists.members
 *   - "Can a channel owner APPLY whitelist X to their channel?"
 *     ⇒ check viewer.title or viewer.uid matches a row in
 *       whitelist_distributions where whitelist_id = X
 *
 * The two are independent: a teacher may have permission to apply
 * a preset (T1) without being in its members list (T2), and a
 * student may be a member (T2) without being able to apply it (T1).
 */
class WhitelistService
{
    /**
     * Admin-side full listing (e.g. for `whitelist:list` CLI).
     * Returns every preset with a member count summary, no
     * distribution details.
     */
    public function listAll(): array
    {
        return DB::table('whitelists')
            ->orderBy('code')
            ->get()
            ->map(function ($r) {
                return [
                    'id'           => (int) $r->id,
                    'code'         => $r->code,
                    'name'         => $r->name,
                    'description'  => $r->description,
                    'member_count' => count($this->decodeMembers($r->members)),
                ];
            })
            ->toArray();
    }

    /**
     * Owner-side listing — returns only presets the given user is
     * cleared to apply via T1 distribution rules. Used by the
     * "apply preset" UI on the channel-owner side. Guests see []
     * (cannot apply anything). Member counts included so owners
     * have rough sense of audience size.
     */
    public function listForApplicant(?User $user): array
    {
        if (!$user) return [];

        $whitelistIds = DB::table('whitelist_distributions')
            ->where(function ($q) use ($user) {
                $q->where(function ($qq) use ($user) {
                    if ($user->title) {
                        $qq->whereNotNull('title')->where('title', $user->title);
                    }
                });
                $q->orWhere(function ($qq) use ($user) {
                    $qq->whereNotNull('uid')->where('uid', $user->uid);
                });
            })
            ->pluck('whitelist_id')
            ->unique()
            ->values()
            ->toArray();

        if (empty($whitelistIds)) return [];

        return DB::table('whitelists')
            ->whereIn('id', $whitelistIds)
            ->orderBy('code')
            ->get()
            ->map(function ($r) {
                return [
                    'id'           => (int) $r->id,
                    'code'         => $r->code,
                    'name'         => $r->name,
                    'description'  => $r->description,
                    'member_count' => count($this->decodeMembers($r->members)),
                ];
            })
            ->toArray();
    }

    public function show(int $whitelistId): ?array
    {
        $row = DB::table('whitelists')->where('id', $whitelistId)->first();
        if (!$row) return null;

        $distributions = DB::table('whitelist_distributions')
            ->where('whitelist_id', $whitelistId)
            ->orderBy('id')
            ->get(['id', 'name', 'description', 'title', 'uid', 'created_at'])
            ->toArray();

        return [
            'id'           => (int) $row->id,
            'code'         => $row->code,
            'name'         => $row->name,
            'description'  => $row->description,
            'members'      => $this->decodeMembers($row->members),
            'distributions'=> $distributions,
        ];
    }

    public function findByCode(string $code): ?object
    {
        return DB::table('whitelists')->where('code', $code)->first();
    }

    public function create(string $code, string $name, ?string $description = null): int
    {
        return DB::table('whitelists')->insertGetId([
            'code'        => $code,
            'name'        => $name,
            'description' => $description,
            'members'     => json_encode([]),
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);
    }

    public function rename(int $whitelistId, string $newName): void
    {
        DB::table('whitelists')
            ->where('id', $whitelistId)
            ->update(['name' => $newName, 'updated_at' => now()]);
        $this->forgetCaches();
    }

    public function setDescription(int $whitelistId, ?string $description): void
    {
        DB::table('whitelists')
            ->where('id', $whitelistId)
            ->update(['description' => $description, 'updated_at' => now()]);
    }

    public function delete(int $whitelistId): void
    {
        DB::table('whitelists')->where('id', $whitelistId)->delete();
        $this->forgetCaches();
    }

    /**
     * Append a single uid to the members set. Idempotent — already
     * present uid is a no-op. Returns true when added, false when
     * already present.
     */
    public function addMember(int $whitelistId, string $uid): bool
    {
        return DB::transaction(function () use ($whitelistId, $uid) {
            return $this->mergeMembers($whitelistId, [$uid]) > 0;
        });
    }

    public function removeMember(int $whitelistId, string $uid): bool
    {
        return DB::transaction(function () use ($whitelistId, $uid) {
            $row = DB::table('whitelists')->where('id', $whitelistId)->first();
            if (!$row) return false;

            $set = $this->decodeMembers($row->members);
            $idx = array_search($uid, $set, true);
            if ($idx === false) return false;
            array_splice($set, $idx, 1);

            DB::table('whitelists')
                ->where('id', $whitelistId)
                ->update([
                    'members'    => json_encode(array_values($set)),
                    'updated_at' => now(),
                ]);
            $this->forgetCaches();
            return true;
        });
    }

    /**
     * Bulk-add every user currently carrying $title to the members
     * set. Returns the count of newly-added uids (existing members
     * are skipped — set semantics, no double bug).
     */
    public function addMembersByTitle(int $whitelistId, string $title): int
    {
        return DB::transaction(function () use ($whitelistId, $title) {
            $uids = DB::table('users')->where('title', $title)->pluck('uid')->toArray();
            if (empty($uids)) return 0;
            return $this->mergeMembers($whitelistId, $uids);
        });
    }

    /**
     * Visibility check — viewer.uid ∈ members? Used by the BC read
     * gates. Null whitelistId means "no whitelist applied" ⇒ the
     * channel is public, so trivially visible.
     */
    public function isMember(?int $whitelistId, string $uid): bool
    {
        if ($whitelistId === null) return true;
        $row = DB::table('whitelists')->where('id', $whitelistId)->first();
        if (!$row) return true;
        return in_array($uid, $this->decodeMembers($row->members), true);
    }

    /**
     * T1 — admin grants permission to apply a preset to channels.
     * `name` is a human label for this distribution (e.g.
     * "Programming Project Lecturers"). At least one of title/uid
     * must be non-null; both null is rejected since it would never
     * match any viewer.
     */
    public function addDistribution(
        int $whitelistId,
        string $name,
        ?string $title = null,
        ?string $uid = null,
        ?string $description = null,
    ): int {
        if ($title === null && $uid === null) {
            abort(422, 'DISTRIBUTION REQUIRES TITLE OR UID');
        }

        return DB::table('whitelist_distributions')->insertGetId([
            'name'         => $name,
            'description'  => $description,
            'whitelist_id' => $whitelistId,
            'title'        => $title,
            'uid'          => $uid,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
    }

    public function removeDistribution(int $distributionId): bool
    {
        return DB::table('whitelist_distributions')
            ->where('id', $distributionId)
            ->delete() > 0;
    }

    /**
     * Owner-application guard. Returns true if $user has any T1
     * row whose title or uid matches them and points to $whitelistId.
     */
    public function canUserApply(?User $user, int $whitelistId): bool
    {
        if (!$user) return false;

        return DB::table('whitelist_distributions')
            ->where('whitelist_id', $whitelistId)
            ->where(function ($q) use ($user) {
                $q->where(function ($qq) use ($user) {
                    if ($user->title) {
                        $qq->whereNotNull('title')->where('title', $user->title);
                    }
                });
                $q->orWhere(function ($qq) use ($user) {
                    $qq->whereNotNull('uid')->where('uid', $user->uid);
                });
            })
            ->exists();
    }

    private function mergeMembers(int $whitelistId, array $uids): int
    {
        $row = DB::table('whitelists')->where('id', $whitelistId)->first();
        if (!$row) return 0;

        $set = $this->decodeMembers($row->members);
        $before = count($set);
        foreach ($uids as $u) {
            if (!in_array($u, $set, true)) $set[] = $u;
        }
        $added = count($set) - $before;
        if ($added === 0) return 0;

        DB::table('whitelists')
            ->where('id', $whitelistId)
            ->update([
                'members'    => json_encode(array_values($set)),
                'updated_at' => now(),
            ]);

        $this->forgetCaches();
        return $added;
    }

    private function decodeMembers($raw): array
    {
        if ($raw === null) return [];
        if (is_array($raw)) return $raw;
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function forgetCaches(): void
    {
        Cache::forget('bc:channels:base');
    }
}
