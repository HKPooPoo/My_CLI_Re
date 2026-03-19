<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

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
            ->select('id', 'code', 'name', 'created_at')
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

    public function authenticate(string $code, string $password): ?object
    {
        $branch = $this->findByCode($code);
        if (! $branch || ! $branch->password) {
            return null;
        }
        if (! Hash::check($password, $branch->password)) {
            return null;
        }
        return $branch;
    }
}
