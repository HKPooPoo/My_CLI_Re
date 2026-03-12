/**
 * Receipt page — renders submitted orders from IndexedDB.
 * Listens to branch-scoped WebSocket for status updates (preparing → ready).
 */

import { t } from './i18n.js';
import db from './db.js';
import { getEcho } from './echo-service.js';
import { getSession } from './session.js';

const receiptPage = document.getElementById('recipt-page');

async function getOrders() {
    return (await db.orders.reverse().sortBy('time')).reverse();
}

export async function saveOrder(order) {
    await db.orders.add(order);
    render();
}

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderOptions(options) {
    if (!options || Object.keys(options).length === 0) return '';
    return Object.entries(options).map(([, val]) => {
        const text = Array.isArray(val) ? val.join(', ') : val;
        return `<span class="order-item-option">${text}</span>`;
    }).join('');
}

export async function render() {
    const orders = await getOrders();

    if (orders.length === 0) {
        receiptPage.innerHTML = `<div class="cart-empty">${t('order.empty')}</div>`;
        return;
    }

    receiptPage.innerHTML = orders.map(order => `
        <div class="order-card">
            <div class="order-card-header">
                <span class="order-number">${t('order.number')}${order.order_number}</span>
                <span class="order-status status-${order.status}">${t('order.status.' + order.status)}</span>
            </div>
            <div class="order-card-time">${formatTime(order.time)}</div>
            <div class="order-items">
                ${order.items.map(item => `
                    <div class="order-item-row">
                        <span class="order-item-name">${item.name}</span>
                        <span class="order-item-price">$${item.subtotal}</span>
                    </div>
                    ${renderOptions(item.options) ? `<div class="order-item-options">${renderOptions(item.options)}</div>` : ''}
                `).join('')}
            </div>
            <div class="order-card-footer">
                <span>${t('cart.total')}</span>
                <span class="order-total-amount">$${order.total}</span>
            </div>
        </div>
    `).join('');
}

// When kitchen marks order ready, update local IDB and re-render
async function onStatusChanged(data) {
    const orderNumber = data.order_number;
    const local = await db.orders.where('order_number').equals(orderNumber).first();
    if (local && local.status !== 'ready') {
        await db.orders.update(local.id, { status: 'ready' });
        render();
    }
}

let currentChannel = null;

async function subscribe() {
    try {
        const echo = await getEcho();
        const session = getSession();
        const channelName = session?.branch_code
            ? `restaurant-orders.${session.branch_code}`
            : 'restaurant-orders';

        if (currentChannel === channelName) return;
        if (currentChannel) echo.leave(currentChannel);
        currentChannel = channelName;

        echo.channel(channelName)
            .listen('.restaurant.order.updated', (data) => {
                if (data.action === 'status_changed') {
                    onStatusChanged(data);
                }
            });
    } catch (err) {
        console.warn('Echo subscribe failed for receipt:', err);
    }
}

// Re-subscribe when session changes (check-in may happen after boot)
window.addEventListener('session:changed', () => subscribe());
window.addEventListener('order:created', () => render());
render();
subscribe();
