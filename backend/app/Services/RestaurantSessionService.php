<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Carbon\Carbon;

class RestaurantSessionService
{
    const SESSION_TTL_HOURS = 1;

    protected function db()
    {
        return DB::connection('restaurant');
    }

    public function checkIn(string $branchCode, int $tableNumber): ?array
    {
        $branch = $this->db()->table('branches')
            ->where('code', strtoupper($branchCode))
            ->first();

        if (! $branch) {
            return null;
        }

        $token = Str::random(32);
        $expiresAt = Carbon::now()->addHours(self::SESSION_TTL_HOURS);

        $this->db()->table('restaurant_sessions')->insert([
            'branch_id' => $branch->id,
            'table_number' => $tableNumber,
            'token' => $token,
            'status' => 'active',
            'created_at' => now(),
            'expires_at' => $expiresAt,
        ]);

        return [
            'token' => $token,
            'branch_code' => $branch->code,
            'branch_name' => $branch->name,
            'table_number' => $tableNumber,
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }

    public function checkOut(string $token): bool
    {
        return (bool) $this->db()->table('restaurant_sessions')
            ->where('token', $token)
            ->where('status', 'active')
            ->update(['status' => 'closed']);
    }

    public function getSession(string $token): ?object
    {
        $session = $this->db()->table('restaurant_sessions')
            ->join('branches', 'restaurant_sessions.branch_id', '=', 'branches.id')
            ->where('restaurant_sessions.token', $token)
            ->where('restaurant_sessions.status', 'active')
            ->where('restaurant_sessions.expires_at', '>', now())
            ->select('restaurant_sessions.*', 'branches.code as branch_code', 'branches.name as branch_name')
            ->first();

        return $session;
    }
}
