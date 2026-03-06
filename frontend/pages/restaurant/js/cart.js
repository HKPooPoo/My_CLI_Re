/**
 * Cart state — instance-based array. Each add = new item.
 * Dispatches 'cart:updated' on change.
 */

let nextId = 1;

/** @type {Array<{id: number, name: string, price: number, options: Array, selected: Object}>} */
const items = [];

function emit(action = 'update') {
    window.dispatchEvent(new CustomEvent('cart:updated', { detail: { action } }));
}

/** Compute item total: base price + selected option extras */
export function itemTotal(item) {
    let extra = 0;
    for (const opt of item.options) {
        const sel = item.selected[opt.key];
        if (sel == null) continue;
        const choice = opt.choices[sel];
        if (choice) extra += choice.extra || 0;
    }
    return item.price + extra;
}

export function addItem(name, price, options = []) {
    const selected = {};
    for (const opt of options) {
        selected[opt.key] = 0; // default to first choice
    }
    items.push({ id: nextId++, name, price, options, selected });
    emit('add');
}

export function removeItem(id) {
    const idx = items.findIndex(i => i.id === id);
    if (idx !== -1) items.splice(idx, 1);
    emit();
}

export function setOption(id, key, choiceIndex) {
    const item = items.find(i => i.id === id);
    if (item) {
        item.selected[key] = choiceIndex;
        emit();
    }
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

export function clear() {
    items.length = 0;
    emit();
}
