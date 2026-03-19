/**
 * Kitchen history page — fetches non-pending orders from API.
 * Unified order card: order_number as primary identifier.
 */

import { t } from './i18n.js';
import { BRANCH } from './branch.js';
import { fetchOrders } from './restaurant-api.js';

const page = document.getElementById('kitchen-history-page');

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function render() {
    try {
        const orders = await fetchOrders(BRANCH);
        const history = orders.filter(o => o.status !== 'pending');

        if (!history.length) {
            page.innerHTML = `<div class="cart-empty">${t('kitchen.no-history')}</div>`;
            return;
        }

        page.innerHTML = history.reverse().map(order => {
            const isDone = ['delivering', 'delivered'].includes(order.status);
            const items = order.items || [];

            return `
            <div class="order-card kitchen-card ${isDone ? 'kitchen-done' : ''}">
                <div class="order-card-header">
                    <span class="order-number">${t('order.number')}${order.order_number}</span>
                    <span class="order-status status-${order.status}">${t('order.status.' + order.status)}</span>
                </div>
                <div class="order-card-time">${formatTime(order.created_at)}</div>
                <div class="order-card-delivery">${order.delivery_zone || ''} · ${order.delivery_address || ''}</div>
                <div class="order-card-contact">${order.customer_name || ''} · ${order.customer_phone || ''}</div>
                ${order.comment ? `<div class="order-card-comment">${order.comment}</div>` : ''}
                <div class="order-items">
                    ${items.map(item => {
                        const opts = typeof item.options === 'string' ? JSON.parse(item.options) : item.options;
                        const optsHtml = opts && Object.keys(opts).length
                            ? `<div class="order-item-options">${Object.entries(opts).map(([, v]) => {
                                const txt = Array.isArray(v) ? v.join(', ') : v;
                                return `<span class="order-item-option">${txt}</span>`;
                            }).join('')}</div>` : '';
                        return `
                            <div class="order-item-row">
                                <span class="order-item-name">${item.name}</span>
                                <span class="order-item-price">$${item.subtotal}</span>
                            </div>
                            ${optsHtml}`;
                    }).join('')}
                </div>
                <div class="order-card-footer">
                    <span>${t('cart.grand-total')}</span>
                    <span class="order-total-amount">$${order.total}</span>
                </div>
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
