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
            $table->string('user_uid');
            $table->string('branch_id'); // 唯一識別：建立時的時間戳記
            $table->string('branch_name')->nullable(); // 可變動的顯示名稱 (標籤)
            $table->bigInteger('timestamp'); // 紀錄的時間點 (History Node)
            $table->text('text')->nullable();
            $table->binary('bin')->nullable();
            $table->string('created_at_str')->nullable(); // HKT 格式字串
            $table->timestamps();

            // 複合索引：由 UID + BranchID + NodeTimestamp 構成唯一紀錄
            $table->index(['user_uid', 'branch_id', 'timestamp']);
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
