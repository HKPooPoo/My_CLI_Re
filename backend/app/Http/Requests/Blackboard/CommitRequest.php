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
            'records' => 'required|array'
        ];
    }
}
