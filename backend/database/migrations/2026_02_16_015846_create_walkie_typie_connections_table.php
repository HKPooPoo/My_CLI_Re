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
            $table->string('user_uid');          // Who "owns" this entry in their list
            $table->string('partner_uid');       // Who they are connected to
            $table->string('partner_tag')->nullable();
            $table->bigInteger('my_branch_id');     // The branch ID used for "WE" (Owner: user_uid)
            $table->bigInteger('partner_branch_id');// The branch ID used for "THEY" (Owner: partner_uid)
            $table->bigInteger('last_signal');      // Last activity timestamp
            $table->timestamps();

            $table->unique(['user_uid', 'partner_uid']);
            $table->index('user_uid');
            $table->index('partner_uid');
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
