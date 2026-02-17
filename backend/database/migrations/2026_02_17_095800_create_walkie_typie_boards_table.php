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
        Schema::create('walkie_typie_boards', function (Blueprint $table) {
            $table->id();
            $table->string('owner');              // User UID
            $table->string('branch_id');          // Deterministic: wt_{A}_{B}
            $table->string('branch_name')->nullable();
            $table->bigInteger('timestamp');      // History Node Timestamp
            $table->longText('text')->nullable();
            $table->binary('bin')->nullable();    // Reserved for binary files
            $table->timestamps();

            // 複合唯一索引
            $table->unique(['owner', 'branch_id', 'timestamp']);
            // WT 特性索引：deleteBoards 及 broadcastUpdate 查詢用
            $table->index('owner');
            $table->index('branch_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('walkie_typie_boards');
    }
};
