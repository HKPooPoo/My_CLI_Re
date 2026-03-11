<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\User>
 */
class UserFactory extends Factory
{
    protected static ?string $passcode;

    public function definition(): array
    {
        return [
            'uid' => fake()->unique()->userName(),
            'passcode' => static::$passcode ??= Hash::make('testpass'),
        ];
    }

    public function withTitle(string $title = 'ADMIN'): static
    {
        return $this->state(fn () => ['title' => $title]);
    }

    public function withEmail(string $email = null): static
    {
        return $this->state(fn () => [
            'email' => $email ?? fake()->safeEmail(),
        ]);
    }
}
