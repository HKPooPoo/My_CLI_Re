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
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('branch_id');
            $table->string('branch_name')->nullable();
            $table->bigInteger('timestamp');
            $table->longText('text')->nullable();
            $table->string('file_hash', 512)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'branch_id', 'timestamp']);
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
