<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('broadcast_channels', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();   // Channel name, globally unique, user-editable
            $table->string('owner_uid');        // Must be a uid with title
            $table->bigInteger('last_signal');  // Last cast time in ms (Unix timestamp)
            $table->timestamps();

            $table->index('owner_uid');
            $table->index('last_signal');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('broadcast_channels');
    }
};
