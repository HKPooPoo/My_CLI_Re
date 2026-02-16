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
            'branchId' => 'required',
            'branchName' => 'required',
            'records' => 'required|array'
        ];
    }
}
