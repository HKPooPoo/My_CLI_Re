<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'restaurant';

    public function up(): void
    {
        Schema::connection('restaurant')->create('branches', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->timestamps();
        });

        Schema::connection('restaurant')->create('restaurant_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->integer('table_number');
            $table->string('token')->unique();
            $table->string('status')->default('active');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('expires_at');
        });

        Schema::connection('restaurant')->table('orders', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->integer('table_number')->nullable();
            $table->string('session_token')->nullable();
        });

        // Seed default branches
        DB::connection('restaurant')->table('branches')->insert([
            ['code' => 'TM', 'name' => 'Tuen Mun', 'created_at' => now(), 'updated_at' => now()],
            ['code' => 'TSW', 'name' => 'Tin Shui Wai', 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::connection('restaurant')->table('orders', function (Blueprint $table) {
            $table->dropForeign(['branch_id']);
            $table->dropColumn(['branch_id', 'table_number', 'session_token']);
        });

        Schema::connection('restaurant')->dropIfExists('restaurant_sessions');
        Schema::connection('restaurant')->dropIfExists('branches');
    }
};
