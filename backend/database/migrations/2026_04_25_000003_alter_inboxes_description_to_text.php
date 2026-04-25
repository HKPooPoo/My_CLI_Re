<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The inbox description column was originally varchar(500) — fine
     * for a tagline but too small for the assignment-prompt text the
     * lecturer needs to write when posting an inbox to students. Widen
     * to TEXT so a multi-paragraph prompt fits.
     *
     * SQLite (test DB) stores all strings as TEXT natively so this is
     * a no-op there. PostgreSQL needs an explicit ALTER COLUMN.
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE inboxes ALTER COLUMN description TYPE text');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE inboxes ALTER COLUMN description TYPE varchar(500)');
        }
    }
};
