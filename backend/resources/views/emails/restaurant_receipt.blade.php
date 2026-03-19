<div style="font-family: monospace; max-width: 400px; margin: 0 auto; padding: 20px; border: 2px solid #333;">
    <h2 style="text-align: center; margin: 0 0 12px;">臺味冰點</h2>
    <p style="text-align: center; font-size: 0.9em; opacity: 0.6; margin: 0 0 16px;">Taiwan Ice Station — Receipt</p>

    <div style="border-top: 2px dashed #333; padding-top: 12px; margin-bottom: 12px;">
        <strong>取餐碼 {{ $order->order_number }}</strong><br>
        <span style="font-size: 0.85em; opacity: 0.6;">{{ $order->created_at }}</span>
    </div>

    @if($order->customer_name || $order->customer_phone)
    <div style="font-size: 0.9em; margin-bottom: 8px;">
        {{ $order->customer_name }} · {{ $order->customer_phone }}
    </div>
    @endif

    @if($order->delivery_zone)
    <div style="font-size: 0.9em; margin-bottom: 12px;">
        {{ $order->delivery_zone }} · {{ $order->delivery_address }}
    </div>
    @endif

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
        @foreach($items as $item)
        <tr>
            <td style="padding: 4px 0;">{{ $item->name }}</td>
            <td style="padding: 4px 0; text-align: right;">${{ $item->subtotal }}</td>
        </tr>
        @endforeach
    </table>

    <div style="border-top: 1px solid #ccc; padding-top: 8px;">
        @if($order->delivery_fee > 0)
        <div style="display: flex; justify-content: space-between; font-size: 0.9em;">
            <span>運費</span>
            <span>${{ $order->delivery_fee }}</span>
        </div>
        @endif
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.1em; margin-top: 4px;">
            <span>總計</span>
            <span>${{ $order->total }}</span>
        </div>
    </div>

    @if($order->comment)
    <div style="margin-top: 12px; font-size: 0.85em; font-style: italic; color: #666;">
        備註: {{ $order->comment }}
    </div>
    @endif

    <p style="text-align: center; font-size: 0.75em; opacity: 0.4; margin-top: 16px;">© 2026 臺味冰點</p>
</div>
