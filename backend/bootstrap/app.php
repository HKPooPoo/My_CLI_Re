<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        // channels: removed — broadcasting routes are registered manually in api.php
        // to avoid 'web'+'auth' middleware which causes 500 (no login route in API-only app).
        // Channel authorization callbacks are loaded via require() in api.php.
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(prepend: [
            \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
        ]);

        // ShareErrorsFromSession removed — it's a web/Blade middleware that shares
        // form validation $errors with views. This is a pure API app (no Blade).
        // More critically: when requests arrive from non-stateful domains (e.g.
        // my-cli.uk via Cloudflare tunnel), Sanctum's fromFrontend() returns false
        // and skips StartSession → ShareErrorsFromSession crashes with
        // "Session store not set on request" → 500 on every API endpoint.

        $middleware->validateCsrfTokens(except: [
            'api/*',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
