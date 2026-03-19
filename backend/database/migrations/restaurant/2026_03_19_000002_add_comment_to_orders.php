<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'restaurant';

    public function up(): void
    {
        if (! Schema::connection('restaurant')->hasColumn('orders', 'comment')) {
            Schema::connection('restaurant')->table('orders', function (Blueprint $table) {
                $table->text('comment')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::connection('restaurant')->table('orders', function (Blueprint $table) {
            $table->dropColumn('comment');
        });
    }
};
