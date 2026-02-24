<?php

use Illuminate\Support\Facades\Schema;

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$type = Schema::getColumnType('walkie_typie_boards', 'bin');
echo "Column 'bin' type is: " . $type . "
";
