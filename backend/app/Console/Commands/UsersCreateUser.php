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
 *   php artisan users:create-user admin --title=Admin --passcode=secret
 *
 * Re-running with the same uid no-ops by default; pass --update
 * to refresh the title / passcode on an existing row.
 */
class UsersCreateUser extends Command
{
    protected $signature = 'users:create-user
                            {uid : The uid (any non-empty string)}
                            {--title= : Title (e.g. course code for lecturers, "Admin", etc.)}
                            {--passcode=testpass : Initial passcode}
                            {--update : Update title/passcode if user already exists}';

    protected $description = 'Create or update a single user account';

    public function handle(): int
    {
        $uid = trim((string) $this->argument('uid'));
        if ($uid === '') {
            $this->error('uid is required and must be non-empty.');
            return self::FAILURE;
        }

        $existing = DB::table('users')->where('uid', $uid)->first();
        $hashed = Hash::make((string) $this->option('passcode'));
        $title = $this->option('title');

        if ($existing) {
            if (!$this->option('update')) {
                $this->info("User '{$uid}' already exists. Use --update to refresh.");
                return self::SUCCESS;
            }
            $fields = ['passcode' => $hashed, 'updated_at' => now()];
            if ($title !== null) $fields['title'] = $title;
            DB::table('users')->where('uid', $uid)->update($fields);
            $this->info("Updated '{$uid}'.");
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

        $this->info("Created '{$uid}'" . ($title ? " with title '{$title}'" : '') . '.');
        return self::SUCCESS;
    }
}
