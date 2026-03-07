/**
 * Order API — serialize cart items and submit to server.
 */

import { itemTotal } from './cart.js';

export async function submitOrder(cartItems) {
    const items = cartItems.map(item => {
        const options = {};
        for (const opt of item.options) {
            const sel = item.selected[opt.key];
            if (sel == null) continue;
            if (Array.isArray(sel)) {
                const labels = sel.map(ci => opt.choices[ci]?.label).filter(Boolean);
                if (labels.length) options[opt.key] = labels;
            } else {
                options[opt.key] = opt.choices[sel]?.label ?? null;
            }
        }
        return {
            name: item.name,
            base_price: item.price,
            qty: 1,
            options,
            subtotal: itemTotal(item),
        };
    });

    const res = await fetch('/api/restaurant/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ items }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
    }

    return res.json();
}
