<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Whitelist preset registry. Each row is one access-control
     * preset that an authorised owner can apply to a broadcast
     * channel. The `members` JSONB column holds the set of student
     * uids the channel will be visible to once this preset is
     * applied. The `code` column is a human-readable identifier
     * (e.g. "2026_SEHH8964") distinct from the auto-incrementing
     * surrogate `id` used for FK targets.
     */
    public function up(): void
    {
        Schema::create('whitelists', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('description', 500)->nullable();
            $table->jsonb('members')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whitelists');
    }
};
