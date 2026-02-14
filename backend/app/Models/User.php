<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'uid',
        'passcode',
        'email',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'passcode',
        'remember_token',
    ];

    /**
     * Laravel 預設搜尋 'password'，我們指定其使用 'passcode'
     */
    public function getAuthPassword()
    {
        return $this->passcode;
    }
}
