/**
 * Kitchen history page — fetches non-pending orders from API.
 * Read-only view of printed/delivering/delivered orders.
 */

import { t } from './i18n.js';
import { fetchOrders } from './restaurant-api.js';

const page = document.getElementById('kitchen-history-page');

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function render() {
    try {
        const orders = await fetchOrders();
        const history = orders.filter(o => o.status !== 'pending');

        if (!history.length) {
            page.innerHTML = `<div class="cart-empty">${t('kitchen.no-history')}</div>`;
            return;
        }

        page.innerHTML = history.reverse().map(order => {
            const isDone = ['delivered'].includes(order.status);
            const items = order.items || [];
            const qrHtml = order.qr_token
                ? `<div class="kitchen-qr-section">
                    <div class="kitchen-qr-label">${t('kitchen.qr-token')}</div>
                    <div class="kitchen-qr-code">${order.qr_token}</div>
                   </div>` : '';

            return `
            <div class="order-card kitchen-card ${isDone ? 'kitchen-done' : ''}">
                <div class="order-card-header">
                    <span class="order-number">${order.order_number}</span>
                    <span class="order-status status-${order.status}">${t('order.status.' + order.status)}</span>
                </div>
                <div class="order-card-time">${formatTime(order.created_at)}</div>
                <div class="order-card-delivery">${order.delivery_zone || ''} · ${order.delivery_address || ''}</div>
                <div class="order-card-contact">${order.customer_name || ''} · ${order.customer_phone || ''}</div>
                <div class="order-items">
                    ${items.map(item => `
                        <div class="order-item-row">
                            <span class="order-item-name">${item.name}</span>
                            <span class="order-item-price">$${item.subtotal}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="order-card-footer">
                    <span>${t('cart.grand-total')}</span>
                    <span class="order-total-amount">$${order.total}</span>
                </div>
                ${qrHtml}
            </div>`;
        }).join('');
    } catch (err) {
        page.innerHTML = `<div class="cart-empty">${err.message}</div>`;
    }
}

window.addEventListener('restaurant:orderCreated', render);
window.addEventListener('restaurant:orderUpdated', render);
render();
setInterval(render, 2000);
