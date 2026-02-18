<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Change `bin` column from binary (BYTEA) to string (VARCHAR)
     * in both blackboards and walkie_typie_boards tables.
     * Now stores file hash reference instead of raw bytes.
     */
    public function up(): void
    {
        // Postgres: drop old binary column + add string column
        // (ALTER COLUMN type change from bytea to varchar is not safe, so drop+add)
        Schema::table('blackboards', function (Blueprint $table) {
            $table->dropColumn('bin');
        });
        Schema::table('blackboards', function (Blueprint $table) {
            $table->string('bin', 512)->nullable()->after('text');
        });

        Schema::table('walkie_typie_boards', function (Blueprint $table) {
            $table->dropColumn('bin');
        });
        Schema::table('walkie_typie_boards', function (Blueprint $table) {
            $table->string('bin', 512)->nullable()->after('text');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('blackboards', function (Blueprint $table) {
            $table->dropColumn('bin');
        });
        Schema::table('blackboards', function (Blueprint $table) {
            $table->binary('bin')->nullable()->after('text');
        });

        Schema::table('walkie_typie_boards', function (Blueprint $table) {
            $table->dropColumn('bin');
        });
        Schema::table('walkie_typie_boards', function (Blueprint $table) {
            $table->binary('bin')->nullable()->after('text');
        });
    }
};
