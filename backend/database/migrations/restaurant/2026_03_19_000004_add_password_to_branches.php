<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

return new class extends Migration
{
    protected $connection = 'restaurant';

    public function up(): void
    {
        if (! Schema::connection('restaurant')->hasColumn('branches', 'password')) {
            Schema::connection('restaurant')->table('branches', function (Blueprint $table) {
                $table->string('password')->nullable();
            });
        }

        // Seed default passwords
        DB::connection('restaurant')->table('branches')
            ->where('code', 'TM')
            ->update(['password' => Hash::make('tm1234')]);
        DB::connection('restaurant')->table('branches')
            ->where('code', 'TSW')
            ->update(['password' => Hash::make('tsw1234')]);
    }

    public function down(): void
    {
        Schema::connection('restaurant')->table('branches', function (Blueprint $table) {
            $table->dropColumn('password');
        });
    }
};
