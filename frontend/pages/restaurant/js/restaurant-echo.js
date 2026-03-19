/**
 * Restaurant WebSocket — connects to Laravel Reverb for real-time order updates.
 * Listens on public channel `restaurant-orders` for order events.
 * Dispatches CustomEvents so page modules can react without importing Echo.
 *
 * Events dispatched:
 *   restaurant:orderCreated     { detail: { order_number, branch_code } }
 *   restaurant:orderUpdated     { detail: { order_number, action, branch_code } }
 */

let echo = null;

export async function initRestaurantEcho(branchCode) {
    if (echo) return;

    // Load Echo + Pusher vendor libs (same as main platform)
    await import('/javascript/vendor/pusher.min.js');
    await import('/javascript/vendor/echo.iife.js');

    // Fetch Reverb config
    let config;
    try {
        const res = await fetch('/api/walkie-typie/config');
        if (!res.ok) return;
        config = await res.json();
    } catch {
        console.warn('Restaurant Echo: config fetch failed, real-time disabled');
        return;
    }

    const host = window.location.hostname;
    const port = window.location.port
        ? parseInt(window.location.port)
        : (location.protocol === 'https:' ? 443 : 80);
    const isTLS = location.protocol === 'https:';

    echo = new window.Echo({
        broadcaster: 'reverb',
        key: config.key,
        wsHost: host,
        wsPort: port,
        wssPort: port,
        forceTLS: isTLS,
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
    });

    function handleEvent(data) {
        const eventName = data.action === 'created'
            ? 'restaurant:orderCreated'
            : 'restaurant:orderUpdated';
        window.dispatchEvent(new CustomEvent(eventName, { detail: data }));
    }

    // Listen on the global channel (customer/deliverer pages)
    echo.channel('restaurant-orders').listen('.restaurant.order.updated', handleEvent);

    // Also listen on branch-specific channel if branch provided (kitchen pages)
    if (branchCode) {
        echo.channel(`restaurant-orders.${branchCode}`).listen('.restaurant.order.updated', handleEvent);
    }
}

export function disconnectRestaurantEcho() {
    echo?.disconnect();
    echo = null;
}
