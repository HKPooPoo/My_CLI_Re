<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class BindEmailMail extends Mailable
{
    use Queueable, SerializesModels;

    public $command;

    public function __construct($command)
    {
        $this->command = $command;
    }

    public function build()
    {
        return $this->subject('[ SYSTEM ] EMAIL BINDING COMMAND')
                    ->view('emails.bind_email');
    }
}
