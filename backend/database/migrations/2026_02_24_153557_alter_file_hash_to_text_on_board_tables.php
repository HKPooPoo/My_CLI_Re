<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // PostgreSQL-only: widen varchar(512) to text for JSON array storage.
        // SQLite already stores all strings as TEXT, so this is a no-op there.
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE blackboards ALTER COLUMN file_hash TYPE text');
            DB::statement('ALTER TABLE walkie_typie_boards ALTER COLUMN file_hash TYPE text');
            DB::statement('ALTER TABLE broadcast_boards ALTER COLUMN file_hash TYPE text');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE blackboards ALTER COLUMN file_hash TYPE varchar(512)');
            DB::statement('ALTER TABLE walkie_typie_boards ALTER COLUMN file_hash TYPE varchar(512)');
            DB::statement('ALTER TABLE broadcast_boards ALTER COLUMN file_hash TYPE varchar(512)');
        }
    }
};
