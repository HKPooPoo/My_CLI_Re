<?php

/*
|--------------------------------------------------------------------------
| Timing Configuration
|--------------------------------------------------------------------------
|
| Loads timing.json from the same directory and exposes it via Laravel's
| config() helper. Use as: config('timing.backend.cacheTTL.bbBranchList')
|
| The deployer edits timing.json (pure JSON, no PHP needed); the frontend
| fetches the same values through GET /api/config/timing.
|
| Auth tokens (10-min reset/bind expiry) are NOT here — kept hardcoded in
| AuthService for security.
|
*/

$path = __DIR__ . '/timing.json';
$json = file_get_contents($path);
$config = json_decode($json, true);

if (!is_array($config)) {
    throw new \RuntimeException("Failed to load timing.json from {$path}");
}

return $config;
