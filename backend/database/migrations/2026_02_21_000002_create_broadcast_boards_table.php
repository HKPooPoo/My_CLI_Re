<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('broadcast_boards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('channel_id')->constrained('broadcast_channels')->cascadeOnDelete();
            $table->bigInteger('timestamp');
            $table->longText('text')->nullable();
            $table->string('file_hash', 512)->nullable();
            $table->timestamps();

            $table->unique(['channel_id', 'timestamp']);
            $table->index('channel_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('broadcast_boards');
    }
};
