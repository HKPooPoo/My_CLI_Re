<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class File extends Model
{
    protected $fillable = [
        'hash',
        'user_id',
        'original_name',
        'mime_type',
        'size',
        'disk_path',
        'status',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
