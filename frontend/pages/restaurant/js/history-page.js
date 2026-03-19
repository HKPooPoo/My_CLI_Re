/**
 * History page — renders all submitted orders from IndexedDB.
 * Listens to order:created and order:statusChanged for live updates.
 */

import { t } from './i18n.js';
import { getOrders } from './order-store.js';

const page = document.getElementById('history-page');

const STATUS_CLASSES = {
    pending: 'status-pending',
    printed: 'status-printed',
    preparing: 'status-preparing',
    ready: 'status-ready',
    delivering: 'status-delivering',
    delivered: 'status-delivered',
    rejected: 'status-rejected',
};

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderItemOptions(options) {
    if (!options || Object.keys(options).length === 0) return '';
    return Object.entries(options).map(([, val]) => {
        const text = Array.isArray(val) ? val.join(', ') : val;
        return `<span class="order-item-option">${text}</span>`;
    }).join('');
}

async function render() {
    const orders = await getOrders();

    if (orders.length === 0) {
        page.innerHTML = `<div class="cart-empty">${t('order.empty')}</div>`;
        return;
    }

    // Newest first
    page.innerHTML = orders.reverse().map(order => {
        const statusCls = STATUS_CLASSES[order.status] || '';
        const showEst = ['pending', 'printed', 'preparing', 'ready', 'delivering'].includes(order.status);
        const estHtml = showEst && order.estimatedMinutes
            ? `<div class="order-card-est">${t('order.est-time')} ~${order.estimatedMinutes} ${t('order.minutes')}</div>`
            : '';
        const rejectHtml = order.status === 'rejected' && order.rejectReason
            ? `<div class="order-card-reject">${t('kitchen.reject-reason')}: ${order.rejectReason}</div>`
            : '';
        const deliveryHtml = order.deliveryZone
            ? `<div class="order-card-delivery">${order.deliveryZone} · ${order.deliveryAddress}</div>`
            : '';

        return `
        <div class="order-card">
            <div class="order-card-header">
                <span class="order-number">${t('order.number')}${order.orderNumber}</span>
                <span class="order-status ${statusCls}">${t('order.status.' + order.status)}</span>
            </div>
            <div class="order-card-time">${formatTime(order.createdAt)}</div>
            ${deliveryHtml}
            ${estHtml}
            ${rejectHtml}
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
                <span>${t('cart.delivery-fee')}</span>
                <span>$${order.deliveryFee || 0}</span>
            </div>
            <div class="order-card-footer">
                <span>${t('cart.grand-total')}</span>
                <span class="order-total-amount">$${order.total}</span>
            </div>
        </div>`;
    }).join('');
}

window.addEventListener('order:created', render);
window.addEventListener('order:statusChanged', render);
render();
