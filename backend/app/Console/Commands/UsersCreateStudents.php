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
 *   → creates S20260001 .. S20260010, each with passcode = its uid
 *
 * Default policy (demo): each account's passcode equals its own
 * uid (so S20260001 logs in with "S20260001"). Pass --passcode
 * explicitly to override with a single shared passcode for all.
 *
 * Existing uids are skipped, never overwritten — safe to re-run.
 */
class UsersCreateStudents extends Command
{
    protected $signature = 'users:create-students
                            {first : First sequence number, e.g. 1}
                            {last : Last sequence number, e.g. 10}
                            {--year=2026 : 4-digit entering year}
                            {--passcode= : Override: one passcode shared by all (default = use each uid as its own passcode)}
                            {--title= : Title to assign (default = NULL — students are titleless audience)}';

    protected $description = 'Generate empty student accounts S{year}{NNNN} in a numeric range';

    public function handle(): int
    {
        $first = (int) $this->argument('first');
        $last  = (int) $this->argument('last');
        $year  = (int) $this->option('year');
        $titleOpt = $this->option('title');
        $title = ($titleOpt !== null && $titleOpt !== '') ? $titleOpt : null;
        $shared = $this->option('passcode'); // null/empty ⇒ "use each uid"

        if ($year < 1000 || $year > 9999) {
            $this->error('--year must be 4 digits.');
            return self::FAILURE;
        }
        if ($first < 1 || $last < $first || $last > 9999) {
            $this->error('Range invalid. Need 1 ≤ first ≤ last ≤ 9999.');
            return self::FAILURE;
        }

        $sharedHash = ($shared !== null && $shared !== '') ? Hash::make($shared) : null;
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
                'passcode'   => $sharedHash ?? Hash::make($uid),
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
            $passcodeNote = $sharedHash
                ? "shared passcode = '{$shared}'"
                : 'passcode = uid (each account logs in with its own uid as the password)';
            $this->line("Range: {$exFirst} … {$exLast}; {$passcodeNote}");
        }
        return self::SUCCESS;
    }
}
