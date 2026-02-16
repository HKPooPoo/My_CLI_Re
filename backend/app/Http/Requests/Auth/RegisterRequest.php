<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    public function authorize()
    {
        return true;
    }

    public function rules()
    {
        return [
            'uid' => 'required|alpha_dash|unique:users|max:32',
            'passcode' => 'required|string|regex:/^[a-zA-Z0-9!@#$%^&*]{4,32}$/',
        ];
    }

    public function messages()
    {
        return [
            'passcode.regex' => 'PASSCODE MUST BE 4-32 CHARS AND CONTAINS NO SPACES.'
        ];
    }
}
