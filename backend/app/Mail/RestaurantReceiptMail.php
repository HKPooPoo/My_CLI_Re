<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class RestaurantReceiptMail extends Mailable
{
    use Queueable, SerializesModels;

    public object $order;
    public $items;

    public function __construct(object $order, $items)
    {
        $this->order = $order;
        $this->items = $items;
    }

    public function build()
    {
        return $this->subject("臺味冰點 — 收據 {$this->order->order_number}")
                    ->view('emails.restaurant_receipt');
    }
}
