/**
 * Order store — local order management via IndexedDB.
 * All data stays in IDB; cross-page communication via CustomEvents.
 * No API calls — this is the static prototype data layer.
 *
 * Events dispatched:
 *   order:created        { detail: order }
 *   order:statusChanged  { detail: order | null }
 */

import db from './db.js';

/* ── BroadcastChannel for cross-tab sync ── */

const channel = new BroadcastChannel('restaurant-orders');
channel.onmessage = (e) => {
    window.dispatchEvent(new CustomEvent(e.data.type, { detail: e.data.detail }));
};

function broadcast(type, detail) {
    window.dispatchEvent(new CustomEvent(type, { detail }));
    channel.postMessage({ type, detail });
}

/* ── Order number generator ── */

let counter = Number(localStorage.getItem('order-counter') || '0');

function nextOrderNumber() {
    counter++;
    localStorage.setItem('order-counter', String(counter));
    return 'TIS' + String(counter).padStart(3, '0');
}

/* ── QR token generator ── */

function generateToken() {
    return crypto.randomUUID().slice(0, 8);
}

/* ── Estimated delivery time (mock) ── */

function estimateMinutes(distanceKm) {
    return Math.round(15 + distanceKm * 5);
}

/* ── CRUD ── */

export async function createOrder({ items, deliveryZone, deliveryAddress, deliveryFee, distanceKm, customerName, customerPhone, subtotal }) {
    const order = {
        orderNumber: nextOrderNumber(),
        status: 'pending',
        items,
        deliveryZone,
        deliveryAddress,
        deliveryFee,
        distanceKm,
        customerName,
        customerPhone,
        subtotal,
        total: subtotal + deliveryFee,
        qrToken: null,
        rejectReason: null,
        estimatedMinutes: estimateMinutes(distanceKm),
        createdAt: new Date().toISOString(),
    };
    order.id = await db.orders.add(order);
    broadcast('order:created', order);
    return order;
}

export async function getOrders() {
    return db.orders.orderBy('id').toArray();
}

export async function getOrderByToken(token) {
    if (!token) return null;
    const all = await db.orders.toArray();
    return all.find(o => o.qrToken === token) || null;
}

export async function getOrderByNumber(orderNumber) {
    if (!orderNumber) return null;
    const all = await db.orders.toArray();
    return all.find(o => o.orderNumber === orderNumber) || null;
}

export async function updateStatus(orderNumber, status, rejectReason) {
    const order = await getOrderByNumber(orderNumber);
    if (!order) return null;

    const patch = { status };
    if (status === 'ready' && !order.qrToken) {
        patch.qrToken = generateToken();
    }
    if (status === 'rejected' && rejectReason) {
        patch.rejectReason = rejectReason;
    }

    await db.orders.update(order.id, patch);
    Object.assign(order, patch);
    broadcast('order:statusChanged', order);
    return order;
}

export async function clearOrders() {
    await db.orders.clear();
    localStorage.removeItem('order-counter');
    counter = 0;
    broadcast('order:statusChanged', null);
}

/* ── Delivery PIN ── */

export function getDeliveryPin() {
    return localStorage.getItem('delivery-pin') || '1234';
}

export function setDeliveryPin(pin) {
    localStorage.setItem('delivery-pin', pin);
}

/* ── Menu availability ── */

export function getUnavailableItems() {
    return JSON.parse(localStorage.getItem('menu-unavailable') || '[]');
}

export function setUnavailableItems(list) {
    localStorage.setItem('menu-unavailable', JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('menu:availabilityChanged'));
}

export function toggleAvailability(itemName) {
    const list = getUnavailableItems();
    const idx = list.indexOf(itemName);
    if (idx === -1) list.push(itemName);
    else list.splice(idx, 1);
    setUnavailableItems(list);
    return idx === -1; // true = now unavailable
}
