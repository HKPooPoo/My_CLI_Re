<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'restaurant';

    public function up(): void
    {
        Schema::connection('restaurant')->create('menu_items', function (Blueprint $table) {
            $table->id();
            $table->jsonb('category');         // {"zh-TW":"飯類","en":"Rice"}
            $table->jsonb('name');             // {"zh-TW":"滷肉飯","en":"Braised Pork Rice"}
            $table->integer('price');
            $table->string('image')->nullable();
            $table->jsonb('options_schema')->default('[]');
            $table->jsonb('timeslots')->default('["all"]');
            $table->integer('sort_order')->default(0);
            $table->boolean('available')->default(true);
            $table->timestamps();
        });

        Schema::connection('restaurant')->create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number')->unique();
            $table->string('status')->default('preparing');
            $table->integer('total');
            $table->timestamps();
        });

        Schema::connection('restaurant')->create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('menu_item_id')->nullable()->constrained('menu_items');
            $table->string('name');            // snapshot, plain string at order time
            $table->integer('base_price');
            $table->integer('qty')->default(1);
            $table->jsonb('options')->default('{}');
            $table->integer('subtotal');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::connection('restaurant')->dropIfExists('order_items');
        Schema::connection('restaurant')->dropIfExists('orders');
        Schema::connection('restaurant')->dropIfExists('menu_items');
    }
};
