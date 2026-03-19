/**
 * Restaurant API client — HTTP calls to Laravel backend.
 * Used by kitchen and deliverer pages (PostgreSQL-backed).
 * Customer page uses IndexedDB locally + submits via this API.
 */

const BASE = '/api/restaurant';

function getDelivererToken() {
    try {
        return JSON.parse(localStorage.getItem('deliverer-session'))?.token || null;
    } catch { return null; }
}

async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    const token = getDelivererToken();
    if (token) headers['X-Deliverer-Token'] = token;
    const res = await fetch(`${BASE}${path}`, { headers, ...options });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `API error ${res.status}`);
    return data;
}

/* ══════════════════════════════════════
   Distance (Google Maps proxy)
   ══════════════════════════════════════ */

export function calculateDistance(origin, destination) {
    return request('/distance', {
        method: 'POST',
        body: JSON.stringify({ origin, destination }),
    });
}

/* ══════════════════════════════════════
   Payment (Stripe Checkout)
   ══════════════════════════════════════ */

export function createCheckoutSession(data) {
    return request('/orders/checkout', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/* ══════════════════════════════════════
   Branches
   ══════════════════════════════════════ */

export function authenticateBranch(code, password) {
    return request('/branches/auth', {
        method: 'POST',
        body: JSON.stringify({ code, password }),
    });
}

/* ══════════════════════════════════════
   Orders
   ══════════════════════════════════════ */

export function fetchOrders(branch) {
    const qs = branch ? `?branch=${branch}` : '';
    return request(`/orders${qs}`);
}

export function fetchOrder(orderNumber) {
    return request(`/orders/${orderNumber}`);
}

export function fetchOrderByPickupCode(code) {
    return request(`/orders/pickup/${encodeURIComponent(code)}`);
}

export function fetchOrdersByDeliverer(delivererId) {
    return request(`/orders/deliverer/${delivererId}`);
}

export function submitOrder(data) {
    return request('/orders', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export function updateOrderStatus(orderNumber, status, extra = {}) {
    return request(`/orders/${orderNumber}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...extra }),
    });
}

/* ══════════════════════════════════════
   Deliverers
   ══════════════════════════════════════ */

export function fetchDeliverers() {
    return request('/deliverers');
}

export function registerDeliverer(data) {
    return request('/deliverers', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export function authenticateDeliverer(phone, password) {
    return request('/deliverers/auth', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
    });
}

export function logoutDeliverer() {
    return request('/deliverers/logout', { method: 'POST' });
}

export function updateDelivererStatus(id, status) {
    return request(`/deliverers/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    });
}

export function deleteDeliverer(id) {
    return request(`/deliverers/${id}`, { method: 'DELETE' });
}
