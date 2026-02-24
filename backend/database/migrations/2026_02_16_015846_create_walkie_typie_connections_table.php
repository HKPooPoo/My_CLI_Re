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
        Schema::create('walkie_typie_connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('partner_id');
            $table->foreign('partner_id')->references('id')->on('users')->cascadeOnDelete();
            $table->string('partner_tag')->nullable();
            $table->string('my_branch_id');
            $table->string('partner_branch_id');
            $table->bigInteger('last_signal');
            $table->timestamps();

            $table->unique(['user_id', 'partner_id']);
            $table->index('user_id');
            $table->index('partner_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('walkie_typie_connections');
    }
};
