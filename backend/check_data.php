<?php

use Illuminate\Support\Facades\DB;

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$rows = DB::table('walkie_typie_boards')->limit(5)->get(['id', 'bin']);
foreach ($rows as $row) {
    echo "ID: " . $row->id . ", Bin: " . ($row->bin ?? 'NULL') . "
";
}
