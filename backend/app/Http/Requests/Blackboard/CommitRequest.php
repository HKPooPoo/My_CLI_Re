<?php

namespace App\Http\Requests\Blackboard;

use Illuminate\Foundation\Http\FormRequest;

class CommitRequest extends FormRequest
{
    public function authorize()
    {
        return true;
    }

    public function rules()
    {
        return [
            'branch_id' => 'required',
            'branch_name' => 'required',
            'records' => 'required|array|max:1000',
            'records.*.text' => 'nullable|string|max:65535',
            'records.*.timestamp' => 'required|integer',
            'records.*.file_hash' => 'nullable|string|max:65535',
            'device_id' => 'nullable|string|max:64'
        ];
    }
}
