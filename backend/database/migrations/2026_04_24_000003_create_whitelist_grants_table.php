<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * NOTE: filename predates rename — the table created here is
     * `whitelist_distributions`, not "_grants". The Laravel
     * filename is just an ordering token, not the table name.
     *
     * Distribution rule = "this title (or this uid) is allowed to
     * apply this whitelist to a channel they own". A row matches a
     * viewer when `viewer.title = title` OR `viewer.uid = uid`
     * (NULL columns are silently skipped — both columns NULL means
     * the row is dead, never matches). The owner-side endpoint
     * filters preset choices through this table so a teacher only
     * sees presets they're cleared to use.
     */
    public function up(): void
    {
        Schema::create('whitelist_distributions', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('description', 500)->nullable();
            $table->foreignId('whitelist_id')->constrained('whitelists')->cascadeOnDelete();
            $table->string('title')->nullable();
            $table->string('uid')->nullable();
            $table->timestamps();

            $table->index('whitelist_id');
            $table->index('title');
            $table->index('uid');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whitelist_distributions');
    }
};
