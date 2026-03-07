/**
 * Cart state — instance-based array, persisted in IndexedDB via Dexie.
 * Write-through: in-memory array for sync reads, IDB for persistence.
 * Options: type "select" (single choice, default) or "multi" (toggle multiple).
 * Dispatches 'cart:updated' on change.
 */

import db from './db.js';

/** @type {Array<{id: number, name: string, price: number, options: Array, selected: Object}>} */
const items = [];

let ready = false;

function emit(action = 'update') {
    window.dispatchEvent(new CustomEvent('cart:updated', { detail: { action } }));
}

/** Load cart from IDB on startup */
export async function initCart() {
    const stored = await db.cartItems.toArray();
    items.length = 0;
    items.push(...stored);
    ready = true;
    emit();
}

/** Compute item total: base price + selected option extras */
export function itemTotal(item) {
    let extra = 0;
    for (const opt of item.options) {
        const sel = item.selected[opt.key];
        if (sel == null) continue;
        if (Array.isArray(sel)) {
            for (const ci of sel) extra += opt.choices[ci]?.extra || 0;
        } else {
            extra += opt.choices[sel]?.extra || 0;
        }
    }
    return item.price + extra;
}

export async function addItem(name, price, options = []) {
    const selected = {};
    for (const opt of options) {
        selected[opt.key] = opt.type === 'multi' ? [] : 0;
    }
    const item = { name, price, options, selected };
    const id = await db.cartItems.add(item);
    item.id = id;
    items.push(item);
    emit('add');
}

export async function removeItem(id) {
    const idx = items.findIndex(i => i.id === id);
    if (idx !== -1) items.splice(idx, 1);
    await db.cartItems.delete(id);
    emit();
}

export async function setOption(id, key, choiceIndex) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const opt = item.options.find(o => o.key === key);
    if (opt?.type === 'multi') {
        const arr = item.selected[key];
        const pos = arr.indexOf(choiceIndex);
        if (pos === -1) arr.push(choiceIndex);
        else arr.splice(pos, 1);
    } else {
        item.selected[key] = choiceIndex;
    }
    await db.cartItems.put({ ...item });
    emit();
}

export function getItems() {
    return items;
}

export function getTotal() {
    let sum = 0;
    for (const item of items) sum += itemTotal(item);
    return sum;
}

export function getCount() {
    return items.length;
}

export async function clear() {
    items.length = 0;
    await db.cartItems.clear();
    emit();
}
