<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Adds a per-channel calendar JSONB column. Shape is client-
     * opinionated but normally a flat dict:
     *   { "2026-04-23": "Logic Test", ... }
     *
     * Title-owner writes; any user (including non-auth guest) reads,
     * in line with the existing "channels are publicly browsable"
     * architecture.
     */
    public function up(): void
    {
        Schema::table('broadcast_channels', function (Blueprint $table) {
            $table->jsonb('calendar')->nullable()->after('last_signal');
        });
    }

    public function down(): void
    {
        Schema::table('broadcast_channels', function (Blueprint $table) {
            $table->dropColumn('calendar');
        });
    }
};
