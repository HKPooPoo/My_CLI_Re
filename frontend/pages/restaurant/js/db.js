/**
 * Restaurant IndexedDB — Dexie wrapper.
 * Stores: cartItems, orders.
 * Write-through: mutations write to IDB, in-memory arrays stay in sync.
 */

import Dexie from '/javascript/vendor/dexie.js';

const db = new Dexie('restaurant');

db.version(1).stores({
    cartItems: '++id, name',
    orders: '++id, order_number, status, time',
});

db.version(2).stores({
    cartItems: '++id, name',
    orders: '++id, orderNumber, status, createdAt',
}).upgrade(tx => tx.table('orders').clear());

export default db;
