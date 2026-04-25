<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Inbox container — receiver-side rendezvous for many senders'
     * submissions. Mirrors broadcast_channels' shape (owner user_id,
     * optional whitelist for visibility, last_signal for ordering)
     * but flips the directionality:
     *
     *   broadcast_channels  : 1 owner writes records → N viewers read
     *   inboxes             : N senders write submissions → 1 owner
     *                         reads + writes feedback
     *
     * Whitelist semantics flip in tandem:
     *   BC : members = readers
     *   IX : members = submitters (the analog of readers in BC's
     *        many-to-one transposition)
     */
    public function up(): void
    {
        Schema::create('inboxes', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('description', 500)->nullable();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('whitelist_id')->nullable()->constrained('whitelists')->nullOnDelete();
            $table->bigInteger('last_signal');
            $table->timestamps();

            $table->index('user_id');
            $table->index('whitelist_id');
            $table->index('last_signal');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inboxes');
    }
};
