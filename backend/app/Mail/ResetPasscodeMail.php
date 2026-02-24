<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class ResetPasscodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public $uid;
    public $command;

    public function __construct($uid, $command)
    {
        $this->uid = $uid;
        $this->command = $command;
    }

    public function build()
    {
        return $this->subject('[ SECURITY ] PASSCODE RESET COMMAND')
                    ->view('emails.reset_passcode');
    }
}
