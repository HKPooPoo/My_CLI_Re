<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RestaurantMenuSeeder extends Seeder
{
    public function run(): void
    {
        DB::connection('restaurant')->table('menu_items')->insert([
            'category' => '飯類',
            'name' => '滷肉飯',
            'price' => 42,
            'options_schema' => json_encode([
                [
                    'key' => 'size',
                    'type' => 'select',
                    'label' => '飯量',
                    'choices' => [
                        ['value' => 'regular', 'label' => '正常', 'extra' => 0],
                        ['value' => 'large', 'label' => '大碗', 'extra' => 10],
                    ],
                    'default' => 'regular',
                ],
                [
                    'key' => 'extras',
                    'type' => 'multi',
                    'label' => '加料',
                    'choices' => [
                        ['value' => 'egg', 'label' => '滷蛋', 'extra' => 10],
                        ['value' => 'bamboo', 'label' => '筍乾', 'extra' => 10],
                    ],
                ],
                [
                    'key' => 'note',
                    'type' => 'text',
                    'label' => '備註',
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
