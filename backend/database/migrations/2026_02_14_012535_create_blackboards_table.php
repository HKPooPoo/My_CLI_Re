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
            $table->string('owner');          // User UID
            $table->bigInteger('branch_id'); // Immutable Branch ID (Frontend Timestamp)
            $table->string('branch_name')->nullable(); 
            $table->bigInteger('timestamp'); // History Node Timestamp
            $table->longText('text')->nullable();
            $table->binary('bin')->nullable(); // Reserved for binary files
            $table->timestamps(); // DB Internal: created_at, updated_at

            // 複合唯一索引，確保同步邏輯的原子性
            $table->unique(['owner', 'branch_id', 'timestamp']);
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
