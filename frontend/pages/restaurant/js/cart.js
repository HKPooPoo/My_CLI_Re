/**
 * Cart state — in-memory Map, dispatches 'cart:updated' on change.
 */

/** @type {Map<string, {name: string, price: number, qty: number}>} */
const items = new Map();

function emit() {
    window.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: getItems(), total: getTotal() } }));
}

export function addItem(name, price) {
    const existing = items.get(name);
    if (existing) {
        existing.qty++;
    } else {
        items.set(name, { name, price, qty: 1 });
    }
    emit();
}

export function removeItem(name) {
    items.delete(name);
    emit();
}

export function updateQty(name, delta) {
    const item = items.get(name);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) items.delete(name);
    emit();
}

export function getItems() {
    return [...items.values()];
}

export function getTotal() {
    let sum = 0;
    for (const item of items.values()) sum += item.price * item.qty;
    return sum;
}

export function getCount() {
    let count = 0;
    for (const item of items.values()) count += item.qty;
    return count;
}

export function clear() {
    items.clear();
    emit();
}
