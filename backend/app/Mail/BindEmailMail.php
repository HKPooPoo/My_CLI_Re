<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class BindEmailMail extends Mailable implements ShouldQueue
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
