<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('blackboards', function (Blueprint $table) {
            $table->index('branch_id');
            $table->index('timestamp');
        });

        Schema::table('broadcast_boards', function (Blueprint $table) {
            $table->index('timestamp');
        });
    }

    public function down(): void
    {
        Schema::table('blackboards', function (Blueprint $table) {
            $table->dropIndex(['branch_id']);
            $table->dropIndex(['timestamp']);
        });

        Schema::table('broadcast_boards', function (Blueprint $table) {
            $table->dropIndex(['timestamp']);
        });
    }
};
