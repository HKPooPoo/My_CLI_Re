<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class File extends Model
{
    protected $fillable = [
        'hash',
        'owner_uid',
        'original_name',
        'mime_type',
        'size',
        'disk_path',
        'status',
    ];
}
