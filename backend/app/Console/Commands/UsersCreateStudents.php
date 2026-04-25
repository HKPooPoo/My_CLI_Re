<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Bulk-generate empty student accounts following the canonical
 * uid format: S{4-digit-year}{4-digit-sequence}.
 *
 *   php artisan users:create-students 1 10 --year=2026
 *   → creates S20260001 .. S20260010
 *
 * All accounts get title=Student and the same passcode (default
 * 'testpass'). Existing uids are skipped, never overwritten —
 * safe to re-run after a partial creation.
 */
class UsersCreateStudents extends Command
{
    protected $signature = 'users:create-students
                            {first : First sequence number, e.g. 1}
                            {last : Last sequence number, e.g. 10}
                            {--year=2026 : 4-digit entering year}
                            {--passcode=testpass : Initial passcode for all created accounts}
                            {--title=Student : Title to assign}';

    protected $description = 'Generate empty student accounts S{year}{NNNN} in a numeric range';

    public function handle(): int
    {
        $first = (int) $this->argument('first');
        $last  = (int) $this->argument('last');
        $year  = (int) $this->option('year');
        $title = (string) $this->option('title');

        if ($year < 1000 || $year > 9999) {
            $this->error('--year must be 4 digits.');
            return self::FAILURE;
        }
        if ($first < 1 || $last < $first || $last > 9999) {
            $this->error('Range invalid. Need 1 ≤ first ≤ last ≤ 9999.');
            return self::FAILURE;
        }

        $hashed = Hash::make($this->option('passcode'));
        $created = 0;
        $skipped = 0;

        for ($i = $first; $i <= $last; $i++) {
            $uid = sprintf('S%04d%04d', $year, $i);
            $exists = DB::table('users')->where('uid', $uid)->exists();
            if ($exists) {
                $skipped++;
                continue;
            }
            DB::table('users')->insert([
                'uid'        => $uid,
                'title'      => $title,
                'passcode'   => $hashed,
                'email'      => null,
                'settings'   => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $created++;
        }

        $this->info("Created {$created} student account(s); {$skipped} already existed.");
        if ($created > 0) {
            $exFirst = sprintf('S%04d%04d', $year, $first);
            $exLast  = sprintf('S%04d%04d', $year, $last);
            $this->line("Range: {$exFirst} … {$exLast}; passcode = '" . $this->option('passcode') . "'");
        }
        return self::SUCCESS;
    }
}
