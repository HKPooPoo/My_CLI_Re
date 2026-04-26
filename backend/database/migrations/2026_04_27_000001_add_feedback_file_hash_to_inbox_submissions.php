<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inbox_submissions', function (Blueprint $table) {
            $table->text('feedback_file_hash')->nullable()->after('receiver_text');
        });
    }

    public function down(): void
    {
        Schema::table('inbox_submissions', function (Blueprint $table) {
            $table->dropColumn('feedback_file_hash');
        });
    }
};
