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
            $table->string('owner');          // 統一命名為 owner (與前端 BBCore 一致)
            $table->bigInteger('branch_id'); // Immutable Branch ID (Timestamp)
            $table->string('branch_name')->nullable(); // Mutable Display Name
            $table->bigInteger('timestamp'); // History Node Timestamp
            $table->text('text')->nullable();
            $table->binary('bin')->nullable();
            $table->string('created_at_hkt')->nullable(); // HKT 格式的時間字串
            $table->timestamps();

            // 複合唯一約束，確保在同一個持有者與分支下，同一個時間戳只會有一筆記錄
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
