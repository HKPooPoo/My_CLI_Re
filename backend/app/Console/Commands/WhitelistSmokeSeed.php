<?php

namespace App\Console\Commands;

use App\Services\WhitelistService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * One-shot seed for end-to-end whitelist testing. Creates (or reuses)
 * three users + one preset + one distribution grant, so the human
 * tester can immediately log in and exercise the shelf UI.
 *
 *   teacher_alice (title=Faculty)  passcode=testpass  ← apply-grantee
 *   student_bob   (title=Student)  passcode=testpass  ← whitelist member
 *   student_eve   (title=Student)  passcode=testpass  ← non-member
 *
 *   CODE_SMOKE preset with member { student_bob }
 *   Distribution: title=Faculty can apply CODE_SMOKE
 *
 * Safe to re-run — uses updateOrInsert / findByCode / idempotent
 * add. Re-running wipes nothing.
 */
class WhitelistSmokeSeed extends Command
{
    protected $signature = 'whitelist:smoke-seed';
    protected $description = 'Seed three users + one whitelist + one distribution grant for E2E testing';

    public function handle(WhitelistService $service): int
    {
        $this->ensureUser('teacher_alice', 'Faculty');
        $this->ensureUser('student_bob',   'Student');
        $this->ensureUser('student_eve',   'Student');

        $existing = $service->findByCode('CODE_SMOKE');
        if ($existing) {
            $whitelistId = (int) $existing->id;
            $this->info("Reusing existing whitelist id={$whitelistId}.");
        } else {
            $whitelistId = $service->create(
                'CODE_SMOKE',
                'Smoke-test whitelist',
                'Created by whitelist:smoke-seed. Safe to delete after testing.'
            );
            $this->info("Created whitelist id={$whitelistId}.");
        }

        $service->addMember($whitelistId, 'student_bob');

        $hasGrant = DB::table('whitelist_distributions')
            ->where('whitelist_id', $whitelistId)
            ->where('title', 'Faculty')
            ->exists();

        if (!$hasGrant) {
            $service->addDistribution(
                $whitelistId,
                'Faculty can apply CODE_SMOKE',
                title: 'Faculty',
                description: 'Auto-created by whitelist:smoke-seed',
            );
            $this->info('Granted Faculty title to apply CODE_SMOKE.');
        }

        $this->newLine();
        $this->info('─────────────────── TEST PLAN ───────────────────');
        $this->line('Users (passcode = testpass for all three):');
        $this->line('  • teacher_alice   (Faculty)   can apply CODE_SMOKE');
        $this->line('  • student_bob     (Student)   member of CODE_SMOKE  → sees private channels');
        $this->line('  • student_eve     (Student)   not a member          → private channels hidden');
        $this->newLine();
        $this->line('Flow:');
        $this->line('  1. Log in as teacher_alice');
        $this->line('  2. Broadcast tab → CREATE a channel (gives name, cast records)');
        $this->line('  3. Open the channel → click the shield (whitelist) feature button');
        $this->line('  4. Shelf lists CODE_SMOKE → click APPLY');
        $this->line('  5. List row now shows padlock icon');
        $this->line('  6. Log out, log in as student_bob → channel visible (padlock shown)');
        $this->line('  7. Log out, log in as student_eve → channel NOT in list; GET the URL → 403');
        $this->line('  8. Back as teacher_alice → click whitelist feature → DETACH → list re-renders public');
        $this->newLine();
        $this->line('Reset: php artisan whitelist:delete CODE_SMOKE --force');

        return self::SUCCESS;
    }

    private function ensureUser(string $uid, string $title): void
    {
        DB::table('users')->updateOrInsert(
            ['uid' => $uid],
            [
                'title'      => $title,
                'passcode'   => Hash::make('testpass'),
                'email'      => null,
                'settings'   => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }
}
