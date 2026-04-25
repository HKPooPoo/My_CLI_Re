<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Create a single user account with explicit uid and (optional) title.
 * Used for lecturers, admins, or any non-student account that
 * doesn't fit the S{year}{NNNN} batch generator.
 *
 *   php artisan users:create-user Lecturer01 --title=SEHH2238
 *   → passcode = "Lecturer01" (default policy)
 *
 *   php artisan users:create-user admin --title=Admin --passcode=secret
 *   → passcode = "secret" (explicit override)
 *
 * Default policy (demo): passcode = uid. Pass --passcode to
 * override. Re-running with the same uid no-ops unless --update.
 */
class UsersCreateUser extends Command
{
    protected $signature = 'users:create-user
                            {uid : The uid (any non-empty string)}
                            {--title= : Title (e.g. course code for lecturers, "Admin", etc.)}
                            {--passcode= : Override (default = uid as passcode)}
                            {--update : Update title/passcode if user already exists}';

    protected $description = 'Create or update a single user account';

    public function handle(): int
    {
        $uid = trim((string) $this->argument('uid'));
        if ($uid === '') {
            $this->error('uid is required and must be non-empty.');
            return self::FAILURE;
        }

        $explicit = $this->option('passcode');
        $passcode = ($explicit !== null && $explicit !== '') ? $explicit : $uid;
        $hashed = Hash::make($passcode);
        $title = $this->option('title');

        $existing = DB::table('users')->where('uid', $uid)->first();
        if ($existing) {
            if (!$this->option('update')) {
                $this->info("User '{$uid}' already exists. Use --update to refresh.");
                return self::SUCCESS;
            }
            $fields = ['passcode' => $hashed, 'updated_at' => now()];
            if ($title !== null) $fields['title'] = $title;
            DB::table('users')->where('uid', $uid)->update($fields);
            $this->info("Updated '{$uid}' (passcode = '{$passcode}').");
            return self::SUCCESS;
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

        $titleNote = $title ? " with title '{$title}'" : '';
        $this->info("Created '{$uid}'{$titleNote}; passcode = '{$passcode}'.");
        return self::SUCCESS;
    }
}
