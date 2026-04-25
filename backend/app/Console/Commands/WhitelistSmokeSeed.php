<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Realistic E2E seed for whitelist verification.
 *
 *   Students:   S20260001 .. S20260010   (title=Student, passcode=testpass)
 *   Lecturers:  Lecturer01 (title=SEHH2238)
 *               Lecturer02 (title=SEHH3140)
 *
 *   Whitelists:
 *     2026SEHH2238 — members S20260001..S20260006
 *     2026SEHH3140 — members S20260006..S20260010
 *
 *   Distributions:
 *     title=SEHH2238 → can apply 2026SEHH2238
 *     title=SEHH3140 → can apply 2026SEHH3140
 *
 * S20260006 is in BOTH whitelists — useful overlap test case.
 * Idempotent — safe to re-run; existing rows are reused.
 */
class WhitelistSmokeSeed extends Command
{
    protected $signature = 'whitelist:smoke-seed';
    protected $description = 'Seed 10 students + 2 lecturers + 2 whitelists for end-to-end verification';

    public function handle(WhitelistService $service): int
    {
        $hashed = Hash::make('testpass');

        // 10 students S20260001 .. S20260010
        for ($i = 1; $i <= 10; $i++) {
            $uid = sprintf('S2026%04d', $i);
            DB::table('users')->updateOrInsert(
                ['uid' => $uid],
                [
                    'title'      => 'Student',
                    'passcode'   => $hashed,
                    'email'      => null,
                    'settings'   => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        }

        // 2 lecturers, title = the course code they teach
        $this->ensureUser('Lecturer01', 'SEHH2238', $hashed);
        $this->ensureUser('Lecturer02', 'SEHH3140', $hashed);

        // 2 whitelists (placeholder course names — admin can rename later
        // via tinker; CLI rename helper not yet exposed)
        $idA = $this->ensureWhitelist($service, '2026SEHH2238', '2026 SEHH2238 Course A');
        $idB = $this->ensureWhitelist($service, '2026SEHH3140', '2026 SEHH3140 Course B');

        // Memberships
        for ($i = 1; $i <= 6; $i++) {
            $service->addMember($idA, sprintf('S2026%04d', $i));
        }
        for ($i = 6; $i <= 10; $i++) {
            $service->addMember($idB, sprintf('S2026%04d', $i));
        }

        // Distribution grants — Faculty title gives apply-permission per course
        $this->ensureDistribution($service, $idA, 'SEHH2238 Faculty', 'SEHH2238');
        $this->ensureDistribution($service, $idB, 'SEHH3140 Faculty', 'SEHH3140');

        $this->newLine();
        $this->info('═══════════════════ E2E TEST PLAN ═══════════════════');
        $this->line('Login passcode for everyone: testpass');
        $this->newLine();
        $this->line('Lecturers (titled — Apply-Preset shelf available):');
        $this->line('  Lecturer01  title=SEHH2238  → can apply 2026SEHH2238');
        $this->line('  Lecturer02  title=SEHH3140  → can apply 2026SEHH3140');
        $this->newLine();
        $this->line('Students (audience):');
        $this->line('  S20260001..S20260005  → only sees 2026SEHH2238 channels');
        $this->line('  S20260006             → sees BOTH (overlap)');
        $this->line('  S20260007..S20260010  → only sees 2026SEHH3140 channels');
        $this->newLine();
        $this->line('Suggested flow:');
        $this->line('  1. Login Lecturer01 → Broadcast → CREATE+CAST a channel');
        $this->line('  2. Open channel → shield (whitelist) shelf → APPLY 2026SEHH2238');
        $this->line('  3. List row shows padlock; whitelist shelf shows applied state');
        $this->line('  4. Login S20260003 → channel visible (member)');
        $this->line('  5. Login S20260008 → channel hidden (non-member)');
        $this->line('  6. Login S20260006 → visible (overlap edge case)');
        $this->line('  7. Login Lecturer02 → cannot apply 2026SEHH2238 (no grant)');
        $this->line('     but the whitelist shelf does list 2026SEHH3140 for them');
        $this->newLine();
        $this->line('Reset:');
        $this->line("  php artisan whitelist:delete 2026SEHH2238 --force");
        $this->line("  php artisan whitelist:delete 2026SEHH3140 --force");
        $this->line('  (User accounts persist — delete via tinker or wipe DB if needed)');

        return self::SUCCESS;
    }

    private function ensureUser(string $uid, string $title, string $hashedPasscode): void
    {
        DB::table('users')->updateOrInsert(
            ['uid' => $uid],
            [
                'title'      => $title,
                'passcode'   => $hashedPasscode,
                'email'      => null,
                'settings'   => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    private function ensureWhitelist(WhitelistService $service, string $code, string $name): int
    {
        $existing = $service->findByCode($code);
        if ($existing) {
            $this->info("Reusing existing whitelist '{$code}' (id={$existing->id}).");
            return (int) $existing->id;
        }
        $id = $service->create($code, $name);
        $this->info("Created whitelist '{$code}' (id={$id}).");
        return $id;
    }

    private function ensureDistribution(WhitelistService $service, int $whitelistId, string $name, string $title): void
    {
        $exists = DB::table('whitelist_distributions')
            ->where('whitelist_id', $whitelistId)
            ->where('title', $title)
            ->exists();
        if ($exists) return;
        $service->addDistribution($whitelistId, $name, title: $title);
    }
}
