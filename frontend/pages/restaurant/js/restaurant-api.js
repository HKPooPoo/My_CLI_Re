/**
 * Restaurant API client — HTTP calls to Laravel backend.
 * Used by kitchen and deliverer pages (PostgreSQL-backed).
 * Customer page uses IndexedDB locally + submits via this API.
 */

const BASE = '/api/restaurant';

async function request(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        ...options,
    });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `API error ${res.status}`);
    return data;
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

export function updateDelivererStatus(id, status) {
    return request(`/deliverers/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    });
}

export function deleteDeliverer(id) {
    return request(`/deliverers/${id}`, { method: 'DELETE' });
}
