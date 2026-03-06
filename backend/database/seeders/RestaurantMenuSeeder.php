<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RestaurantMenuSeeder extends Seeder
{
    public function run(): void
    {
        DB::connection('restaurant')->table('menu_items')->insert([
            'category' => json_encode(['zh-TW' => '飯類', 'en' => 'Rice']),
            'name' => json_encode(['zh-TW' => '滷肉飯', 'en' => 'Braised Pork Rice']),
            'price' => 42,
            'options_schema' => json_encode([
                [
                    'key' => 'size',
                    'type' => 'select',
                    'label' => ['zh-TW' => '飯量', 'en' => 'Size'],
                    'choices' => [
                        ['value' => 'regular', 'label' => ['zh-TW' => '正常', 'en' => 'Regular'], 'extra' => 0],
                        ['value' => 'large', 'label' => ['zh-TW' => '大碗', 'en' => 'Large'], 'extra' => 10],
                    ],
                    'default' => 'regular',
                ],
                [
                    'key' => 'extras',
                    'type' => 'multi',
                    'label' => ['zh-TW' => '加料', 'en' => 'Extras'],
                    'choices' => [
                        ['value' => 'egg', 'label' => ['zh-TW' => '滷蛋', 'en' => 'Braised Egg'], 'extra' => 10],
                        ['value' => 'bamboo', 'label' => ['zh-TW' => '筍乾', 'en' => 'Bamboo'], 'extra' => 10],
                    ],
                ],
                [
                    'key' => 'note',
                    'type' => 'text',
                    'label' => ['zh-TW' => '備註', 'en' => 'Note'],
                ],
            ]),
            'timeslots' => json_encode(['all']),
            'sort_order' => 1,
            'available' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
