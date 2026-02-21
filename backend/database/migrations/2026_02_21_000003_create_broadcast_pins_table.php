<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('broadcast_pins', function (Blueprint $table) {
            $table->id();
            $table->string('user_uid');
            $table->unsignedBigInteger('channel_id');   // References broadcast_channels.id
            $table->timestamps();

            // Each uid can pin each channel at most once
            $table->unique(['user_uid', 'channel_id']);
            $table->index('user_uid');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('broadcast_pins');
    }
};
