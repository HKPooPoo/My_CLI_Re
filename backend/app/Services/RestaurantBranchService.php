<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class RestaurantBranchService
{
    protected function db()
    {
        return DB::connection('restaurant');
    }

    public function createBranch(string $code, string $name): object
    {
        $id = $this->db()->table('branches')->insertGetId([
            'code' => strtoupper($code),
            'name' => $name,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->db()->table('branches')->find($id);
    }

    public function listBranches(): array
    {
        return $this->db()->table('branches')
            ->orderBy('id')
            ->get()
            ->toArray();
    }

    public function findByCode(string $code): ?object
    {
        return $this->db()->table('branches')
            ->where('code', strtoupper($code))
            ->first();
    }
}
