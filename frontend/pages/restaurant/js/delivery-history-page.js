/**
 * Delivery history page — shows all completed deliveries for this deliverer.
 */

import { t } from './i18n.js';
import { getOrdersByDeliverer, getDelivererSession } from './order-store.js';

const page = document.getElementById('delivery-history-page');

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function render() {
    const session = getDelivererSession();
    if (!session) return;

    const orders = await getOrdersByDeliverer(session.id);
    const delivered = orders.filter(o => o.status === 'delivered');

    if (!delivered.length) {
        page.innerHTML = `<div class="cart-empty">${t('delivery.no-history')}</div>`;
        return;
    }

    // Newest first
    page.innerHTML = delivered.reverse().map(order => `
        <div class="order-card kitchen-done">
            <div class="order-card-header">
                <span class="order-number">${t('order.number')}${order.orderNumber}</span>
                <span class="order-status status-${order.status}">${t('order.status.' + order.status)}</span>
            </div>
            <div class="order-card-time">${formatTime(order.createdAt)}</div>
            <div class="order-card-delivery">${order.deliveryZone || ''} · ${order.deliveryAddress || ''}</div>
            <div class="order-card-contact">${order.customerName || ''} · ${order.customerPhone || ''}</div>
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
}

window.addEventListener('order:statusChanged', render);
render();
