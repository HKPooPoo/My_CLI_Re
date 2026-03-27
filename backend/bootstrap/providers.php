<?php

return [
    App\Providers\AppServiceProvider::class,
    // BroadcastServiceProvider removed — broadcast routes and channels
    // are registered manually in api.php to avoid 'web'+'auth' middleware
    // which causes 500 in this API-only app (no login route).
];
