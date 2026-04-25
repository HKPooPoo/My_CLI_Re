<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Attach a channel to a whitelist. NULL = public (default,
     * backward-compat for existing channels — no data migration
     * needed). On whitelist deletion the column becomes NULL again
     * (channel reverts to public) rather than cascading delete the
     * channel itself.
     */
    public function up(): void
    {
        Schema::table('broadcast_channels', function (Blueprint $table) {
            $table->foreignId('whitelist_id')
                ->nullable()
                ->after('flashcards')
                ->constrained('whitelists')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('broadcast_channels', function (Blueprint $table) {
            $table->dropConstrainedForeignId('whitelist_id');
        });
    }
};
