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
        Schema::connection('restaurant')->create('deliverers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('phone')->unique();
            $table->string('password');
            $table->string('status')->default('idle');
            $table->timestamps();
        });

        Schema::connection('restaurant')->table('orders', function (Blueprint $table) {
            $table->string('delivery_zone')->nullable();
            $table->string('delivery_address')->nullable();
            $table->integer('delivery_fee')->default(0);
            $table->string('customer_name')->nullable();
            $table->string('customer_phone')->nullable();
            $table->unsignedBigInteger('deliverer_id')->nullable();
            $table->string('qr_token')->nullable()->unique();
            $table->timestamp('printed_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->integer('estimated_minutes')->nullable();

            $table->foreign('deliverer_id')->references('id')->on('deliverers')->nullOnDelete();
        });

        // Update default status from 'preparing' to 'pending'
        if (DB::connection('restaurant')->getDriverName() === 'pgsql') {
            DB::connection('restaurant')->statement("ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending'");
        }
    }

    public function down(): void
    {
        Schema::connection('restaurant')->table('orders', function (Blueprint $table) {
            $table->dropForeign(['deliverer_id']);
            $table->dropColumn([
                'delivery_zone', 'delivery_address', 'delivery_fee',
                'customer_name', 'customer_phone', 'deliverer_id',
                'qr_token', 'printed_at', 'delivered_at', 'estimated_minutes',
            ]);
        });

        if (DB::connection('restaurant')->getDriverName() === 'pgsql') {
            DB::connection('restaurant')->statement("ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'preparing'");
        }

        Schema::connection('restaurant')->dropIfExists('deliverers');
    }
};
