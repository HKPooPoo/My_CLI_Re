<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Adds a per-channel flashcards JSONB column. Shape is client-
     * opinionated — the full deck state:
     *   {
     *     "cards": [{ "front": "...", "back": "..." }, ...],
     *     "mode":  "sequential" | "random",
     *     "playState": { "currentIdx": 0, "face": "front", "randomHistory": [...] }
     *   }
     *
     * Title-owner writes via the existing `cast` endpoint (bundled
     * with records, same LWW cadence as calendar). Any user —
     * including unauthenticated guests — reads, matching the
     * publicly-browsable channel architecture.
     */
    public function up(): void
    {
        Schema::table('broadcast_channels', function (Blueprint $table) {
            $table->jsonb('flashcards')->nullable()->after('calendar');
        });
    }

    public function down(): void
    {
        Schema::table('broadcast_channels', function (Blueprint $table) {
            $table->dropColumn('flashcards');
        });
    }
};
