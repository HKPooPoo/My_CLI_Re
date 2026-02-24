<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('files', function (Blueprint $table) {
            $table->id();
            $table->string('hash', 64)->unique();   // SHA-256 hex digest
            $table->string('owner_uid');             // Uploader UID
            $table->string('original_name');         // e.g. "video.mp4"
            $table->string('mime_type');              // e.g. "video/mp4"
            $table->unsignedBigInteger('size');       // bytes
            $table->string('disk_path');              // relative path on storage disk
            $table->string('status')->default('staged'); // staged | committed | orphaned
            $table->timestamps();

            $table->index('owner_uid');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('files');
    }
};
