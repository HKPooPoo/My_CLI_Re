/**
 * Kitchen history page — shows all non-pending orders.
 * Read-only view of printed/delivering/delivered orders.
 */

import { t } from './i18n.js';
import { getOrders } from './order-store.js';

const page = document.getElementById('kitchen-history-page');

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderItemOptions(optionsObj) {
    if (!optionsObj || typeof optionsObj !== 'object') return '';
    const entries = Object.entries(optionsObj).filter(([, v]) => v != null);
    if (!entries.length) return '';
    return entries.map(([, val]) => {
        const text = Array.isArray(val) ? val.join(', ') : val;
        return `<span class="order-item-option">${text}</span>`;
    }).join('');
}

async function render() {
    const orders = await getOrders();
    const history = orders.filter(o => o.status !== 'pending');

    if (!history.length) {
        page.innerHTML = `<div class="cart-empty">${t('kitchen.no-history')}</div>`;
        return;
    }

    // Newest first
    page.innerHTML = history.reverse().map(order => {
        const isDone = ['delivered', 'rejected'].includes(order.status);
        const qrHtml = order.qrToken
            ? `<div class="kitchen-qr-section">
                <div class="kitchen-qr-label">${t('kitchen.qr-token')}</div>
                <div class="kitchen-qr-code">${order.qrToken}</div>
               </div>`
            : '';

        return `
        <div class="order-card kitchen-card ${isDone ? 'kitchen-done' : ''}">
            <div class="order-card-header">
                <span class="order-number">${order.orderNumber}</span>
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
                    ${renderItemOptions(item.options) ? `<div class="order-item-options">${renderItemOptions(item.options)}</div>` : ''}
                `).join('')}
            </div>
            <div class="order-card-footer">
                <span>${t('cart.grand-total')}</span>
                <span class="order-total-amount">$${order.total}</span>
            </div>
            ${qrHtml}
        </div>`;
    }).join('');
}

window.addEventListener('order:created', render);
window.addEventListener('order:statusChanged', render);
render();
