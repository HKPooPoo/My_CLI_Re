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
        Schema::create('blackboards', function (Blueprint $table) {
            $table->id();
            $table->string('user_uid')->index();
            $table->string('branch_name');
            $table->bigInteger('timestamp');
            $table->longText('text');
            $table->longText('bin')->nullable();
            $table->string('created_at_str');
            $table->timestamps();

            // Unique constraint on user+branch+timestamp to avoid duplicates
            $table->unique(['user_uid', 'branch_name', 'timestamp']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('blackboards');
    }
};
