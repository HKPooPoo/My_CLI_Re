/**
 * Delivery history page — fetches completed deliveries from API.
 */

import { t } from './i18n.js';
import { fetchOrdersByDeliverer } from './restaurant-api.js';

const page = document.getElementById('delivery-history-page');

function getSession() {
    try { return JSON.parse(localStorage.getItem('deliverer-session')); }
    catch { return null; }
}

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function render() {
    const session = getSession();
    if (!session) return;

    try {
        const orders = await fetchOrdersByDeliverer(session.id);
        const delivered = orders.filter(o => o.status === 'delivered');

        if (!delivered.length) {
            page.innerHTML = `<div class="cart-empty">${t('delivery.no-history')}</div>`;
            return;
        }

        page.innerHTML = delivered.map(order => `
            <div class="order-card kitchen-done">
                <div class="order-card-header">
                    <span class="order-number">${t('order.number')}${order.order_number}</span>
                    <span class="order-status status-${order.status}">${t('order.status.' + order.status)}</span>
                </div>
                <div class="order-card-time">${formatTime(order.created_at)}</div>
                <div class="order-card-delivery">${order.delivery_zone || ''} · ${order.delivery_address || ''}</div>
                <div class="order-card-contact">${order.customer_name || ''} · ${order.customer_phone || ''}</div>
                <div class="order-items">
                    ${(order.items || []).map(item => `
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
            </div>
        `).join('');
    } catch (err) {
        page.innerHTML = `<div class="cart-empty">${err.message}</div>`;
    }
}

window.addEventListener('restaurant:orderUpdated', render);
render();
setInterval(render, 2000);
