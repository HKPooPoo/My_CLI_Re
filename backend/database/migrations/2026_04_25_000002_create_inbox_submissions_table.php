<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Inbox submission — one (inbox, sender) pair = one row by
     * UNIQUE constraint, so resubmit is UPDATE not INSERT.
     *
     * Three content fields cover the inbox's three windows:
     *   file_hash      — the attached file (max 1, hence single
     *                    text column not JSON array as on BB/BC)
     *   sender_text    — the submitter writes
     *   receiver_text  — the inbox owner writes (unidirectional
     *                    feedback; sender reads, never writes here)
     *
     * Timestamps tell the receiver-side UI what to flag NEW:
     *   created_at   — first submit
     *   updated_at   — sender's last edit (auto-bumped on any save)
     *   feedback_at  — receiver's last write to receiver_text;
     *                  null until they first respond
     */
    public function up(): void
    {
        Schema::create('inbox_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inbox_id')->constrained('inboxes')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->text('sender_text')->nullable();
            $table->text('file_hash')->nullable();
            $table->text('receiver_text')->nullable();
            $table->bigInteger('feedback_at')->nullable();
            $table->timestamps();

            $table->unique(['inbox_id', 'user_id']);
            $table->index('user_id');
            $table->index('inbox_id');
            $table->index('updated_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inbox_submissions');
    }
};
