<?php

namespace App\Restaurant\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Cache;

class RestaurantDelivererService
{
    protected function db()
    {
        return DB::connection('restaurant');
    }

    public function register(string $name, string $phone, string $password): object
    {
        $existing = $this->db()->table('deliverers')->where('phone', $phone)->first();
        if ($existing) {
            throw new \InvalidArgumentException('Phone already registered');
        }

        $id = $this->db()->table('deliverers')->insertGetId([
            'name' => $name,
            'phone' => $phone,
            'password' => Hash::make($password),
            'status' => 'idle',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Cache::forget('restaurant:deliverers');

        return $this->db()->table('deliverers')
            ->select('id', 'name', 'phone', 'status')
            ->find($id);
    }

    public function authenticate(string $phone, string $password): ?array
    {
        $deliverer = $this->db()->table('deliverers')->where('phone', $phone)->first();
        if (! $deliverer || ! Hash::check($password, $deliverer->password)) {
            return null;
        }

        // Generate session token
        $token = bin2hex(random_bytes(32));
        $this->db()->table('deliverers')
            ->where('id', $deliverer->id)
            ->update([
                'session_token' => $token,
                'status' => 'idle',
                'updated_at' => now(),
            ]);

        Cache::forget('restaurant:deliverers');

        return [
            'id' => $deliverer->id,
            'name' => $deliverer->name,
            'phone' => $deliverer->phone,
            'status' => 'idle',
            'session_token' => $token,
        ];
    }

    public function validateSession(string $token): ?object
    {
        return $this->db()->table('deliverers')
            ->select('id', 'name', 'phone', 'status')
            ->where('session_token', $token)
            ->first();
    }

    public function logout(string $token): void
    {
        $this->db()->table('deliverers')
            ->where('session_token', $token)
            ->update([
                'session_token' => null,
                'status' => 'offline',
                'updated_at' => now(),
            ]);
        Cache::forget('restaurant:deliverers');
    }

    public function list(): array
    {
        return Cache::remember('restaurant:deliverers', 30, function () {
            return $this->db()->table('deliverers')
                ->select('id', 'name', 'phone', 'status', 'created_at')
                ->orderBy('id')
                ->get()
                ->toArray();
        });
    }

    public function findById(int $id): ?object
    {
        return $this->db()->table('deliverers')
            ->select('id', 'name', 'phone', 'status')
            ->find($id);
    }

    public function updateStatus(int $id, string $status): void
    {
        $this->db()->table('deliverers')
            ->where('id', $id)
            ->update(['status' => $status, 'updated_at' => now()]);
        Cache::forget('restaurant:deliverers');
    }

    public function delete(int $id): void
    {
        $this->db()->table('deliverers')->where('id', $id)->delete();
        Cache::forget('restaurant:deliverers');
    }
}
