<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        // CRITICAL: Force SQLite BEFORE parent::setUp() creates the app
        // and RefreshDatabase runs migrate:fresh. Docker sets
        // DB_CONNECTION=pgsql as OS-level env var which phpunit.xml
        // <env> and defineEnvironment() cannot override in time.
        putenv('DB_CONNECTION=sqlite');
        putenv('DB_DATABASE=:memory:');
        $_ENV['DB_CONNECTION'] = 'sqlite';
        $_ENV['DB_DATABASE'] = ':memory:';
        $_SERVER['DB_CONNECTION'] = 'sqlite';
        $_SERVER['DB_DATABASE'] = ':memory:';

        parent::setUp();

        // Override restaurant connection for SQLite in-memory testing
        config(['database.connections.restaurant' => [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
        ]]);
    }
}
