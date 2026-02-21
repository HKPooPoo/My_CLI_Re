<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('broadcast_boards', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('channel_id');   // References broadcast_channels.id
            $table->bigInteger('timestamp');             // Creation timestamp — NEVER changes (BC ordering mechanism)
            $table->longText('text')->nullable();
            $table->string('bin', 512)->nullable();      // File hash
            $table->timestamps();

            // Composite unique: one history node per channel per timestamp
            $table->unique(['channel_id', 'timestamp']);
            $table->index('channel_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('broadcast_boards');
    }
};
