/**
 * Receipt page — renders submitted orders from localStorage.
 */

import { t } from './i18n.js';

const STORAGE_KEY = 'restaurant-orders';
const receiptPage = document.getElementById('recipt-page');

function getOrders() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}

export function saveOrder(order) {
    const orders = getOrders();
    orders.unshift(order);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
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

function render() {
    const orders = getOrders();

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

window.addEventListener('order:created', () => render());
render();
