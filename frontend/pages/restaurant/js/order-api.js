/**
 * Order API — serialize cart items and submit to server.
 * Includes session_token when checked in.
 */

import { itemTotal } from './cart.js';
import { getSession } from './session.js';

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

    const body = { items };
    const session = getSession();
    if (session?.token) {
        body.session_token = session.token;
    }

    const res = await fetch('/api/restaurant/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
    }

    return res.json();
}
