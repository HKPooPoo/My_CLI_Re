/**
 * Order store — local order management via IndexedDB.
 * All data stays in IDB; cross-page communication via CustomEvents.
 * No API calls — this is the static prototype data layer.
 *
 * Events dispatched:
 *   order:created        { detail: order }
 *   order:statusChanged  { detail: order | null }
 *   deliverer:changed    (no detail — re-read from IDB)
 */

import db from './db.js';

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

/* ══════════════════════════════════════
   Order CRUD
   Status flow: pending → printed → delivering → delivered
   ══════════════════════════════════════ */

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
        delivererId: null,
        estimatedMinutes: estimateMinutes(distanceKm),
        createdAt: new Date().toISOString(),
        printedAt: null,
        deliveredAt: null,
    };
    order.id = await db.orders.add(order);
    window.dispatchEvent(new CustomEvent('order:created', { detail: order }));
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

export async function getOrdersByDeliverer(delivererId) {
    if (!delivererId) return [];
    return db.orders.where('delivererId').equals(delivererId).toArray();
}

export async function updateStatus(orderNumber, status, extra = {}) {
    const order = await getOrderByNumber(orderNumber);
    if (!order) return null;

    const patch = { status, ...extra };

    if (status === 'printed' && !order.qrToken) {
        patch.qrToken = generateToken();
        patch.printedAt = new Date().toISOString();
    }
    if (status === 'delivered') {
        patch.deliveredAt = new Date().toISOString();
    }

    await db.orders.update(order.id, patch);
    Object.assign(order, patch);
    window.dispatchEvent(new CustomEvent('order:statusChanged', { detail: order }));
    return order;
}

export async function clearOrders() {
    await db.orders.clear();
    localStorage.removeItem('order-counter');
    counter = 0;
    window.dispatchEvent(new CustomEvent('order:statusChanged', { detail: null }));
}

/* ══════════════════════════════════════
   Deliverer CRUD
   ══════════════════════════════════════ */

let delivererCounter = Number(localStorage.getItem('deliverer-counter') || '0');

function nextDelivererCode() {
    delivererCounter++;
    localStorage.setItem('deliverer-counter', String(delivererCounter));
    return 'D' + String(delivererCounter).padStart(3, '0');
}

export async function addDeliverer({ name, phone, pin, password }) {
    const deliverer = {
        code: nextDelivererCode(),
        name,
        phone,
        pin,
        password,
        status: 'idle',
        createdAt: new Date().toISOString(),
    };
    deliverer.id = await db.deliverers.add(deliverer);
    window.dispatchEvent(new CustomEvent('deliverer:changed'));
    return deliverer;
}

export async function getDeliverers() {
    return db.deliverers.orderBy('id').toArray();
}

export async function getDelivererByCode(code) {
    if (!code) return null;
    const all = await db.deliverers.toArray();
    return all.find(d => d.code === code) || null;
}

export async function getDelivererById(id) {
    if (!id) return null;
    return db.deliverers.get(id) || null;
}

export async function updateDelivererStatus(id, status) {
    await db.deliverers.update(id, { status });
    window.dispatchEvent(new CustomEvent('deliverer:changed'));
}

export async function deleteDeliverer(id) {
    await db.deliverers.delete(id);
    window.dispatchEvent(new CustomEvent('deliverer:changed'));
}

export async function authenticateDeliverer(code, pin, password) {
    const d = await getDelivererByCode(code);
    if (!d) return null;
    if (d.pin !== pin || d.password !== password) return null;
    return d;
}

/* ══════════════════════════════════════
   Delivery info persistence (localStorage)
   ══════════════════════════════════════ */

export function saveDeliveryInfo(info) {
    localStorage.setItem('delivery-info', JSON.stringify(info));
}

export function getDeliveryInfo() {
    return JSON.parse(localStorage.getItem('delivery-info') || '{}');
}

/* ── Deliverer session ── */

export function getDelivererSession() {
    try { return JSON.parse(localStorage.getItem('deliverer-session')); }
    catch { return null; }
}

export function setDelivererSession(deliverer) {
    localStorage.setItem('deliverer-session', JSON.stringify({
        id: deliverer.id,
        code: deliverer.code,
        name: deliverer.name,
    }));
}

export function clearDelivererSession() {
    localStorage.removeItem('deliverer-session');
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
    return idx === -1;
}
