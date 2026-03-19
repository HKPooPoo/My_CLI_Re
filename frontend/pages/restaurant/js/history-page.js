/**
 * History page — renders orders from IndexedDB with live status from API.
 * Polls API every 2 seconds for status updates.
 *
 * Customer-facing status mapping:
 *   pending           → 準備中
 *   printed           → 等待外送員接單中
 *   delivering/delivered → 已結單
 */

import { t } from './i18n.js';
import { getOrders } from './order-store.js';
import { fetchOrder } from './restaurant-api.js';

const page = document.getElementById('history-page');

// Map backend status → customer-facing status key + CSS class
function customerStatus(status) {
    switch (status) {
        case 'pending':
            return { label: t('order.customer-status.preparing'), cls: 'status-pending' };
        case 'printed':
            return { label: t('order.customer-status.waiting'), cls: 'status-printed' };
        case 'delivering':
        case 'delivered':
        default:
            return { label: t('order.customer-status.done'), cls: 'status-delivered' };
    }
}

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

// Cache of live statuses from API: { apiOrderNumber → status }
const liveStatus = {};

async function pollStatuses(orders) {
    await Promise.all(orders
        .filter(o => o.apiOrderNumber)
        .map(async o => {
            try {
                const apiOrder = await fetchOrder(o.apiOrderNumber);
                if (apiOrder) liveStatus[o.apiOrderNumber] = apiOrder.status;
            } catch {}
        })
    );
}

async function render() {
    const orders = await getOrders();

    if (orders.length === 0) {
        page.innerHTML = `<div class="cart-empty">${t('order.empty')}</div>`;
        return;
    }

    // Poll live statuses from API
    await pollStatuses(orders);

    // Newest first
    page.innerHTML = orders.reverse().map(order => {
        // Use live status if available, else fall back to local
        const effectiveStatus = order.apiOrderNumber && liveStatus[order.apiOrderNumber]
            ? liveStatus[order.apiOrderNumber]
            : (order.status || 'pending');

        const cs = customerStatus(effectiveStatus);
        const orderNum = order.apiOrderNumber || order.orderNumber;
        const isDone = ['delivering', 'delivered'].includes(effectiveStatus);

        const deliveryHtml = order.deliveryZone
            ? `<div class="order-card-delivery">${order.deliveryZone} · ${order.deliveryAddress}</div>`
            : '';
        const commentHtml = order.comment
            ? `<div class="order-card-comment">${order.comment}</div>`
            : '';
        const estHtml = !isDone && order.estimatedMinutes
            ? `<div class="order-card-est">${t('order.est-time')} ~${order.estimatedMinutes} ${t('order.minutes')}</div>`
            : '';

        return `
        <div class="order-card ${isDone ? 'kitchen-done' : ''}">
            <div class="order-card-header">
                <span class="order-number">${t('order.number')}${orderNum}</span>
                <span class="order-status ${cs.cls}">${cs.label}</span>
            </div>
            <div class="order-card-time">${formatTime(order.createdAt)}</div>
            ${deliveryHtml}
            ${commentHtml}
            ${estHtml}
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
setInterval(render, 2000);
