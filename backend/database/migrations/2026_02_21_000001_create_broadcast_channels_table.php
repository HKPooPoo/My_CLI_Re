<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('broadcast_channels', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->bigInteger('last_signal');
            $table->timestamps();

            $table->index('user_id');
            $table->index('last_signal');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('broadcast_channels');
    }
};
