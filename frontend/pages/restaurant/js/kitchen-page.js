/**
 * Kitchen orders page — fetches pending orders from API.
 * Each order has ONE action: "印單" (print ticket).
 * Listens to WebSocket for real-time new order notifications.
 */

import { t } from './i18n.js';
import { fetchOrders, updateOrderStatus } from './restaurant-api.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('kitchen-orders-page');
const toast = new ToastMessager();

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderItemOptions(items) {
    if (!items || !items.length) return '';
    return items.map(item => {
        const opts = typeof item.options === 'string' ? JSON.parse(item.options) : item.options;
        if (!opts || typeof opts !== 'object' || !Object.keys(opts).length) return '';
        return Object.entries(opts).map(([, val]) => {
            const text = Array.isArray(val) ? val.join(', ') : val;
            return `<span class="order-item-option">${text}</span>`;
        }).join('');
    }).join('');
}

function renderOrderCard(order) {
    const items = order.items || [];
    return `
    <div class="order-card kitchen-card">
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
        <button class="kitchen-btn kitchen-print-btn" data-order="${order.order_number}">${t('kitchen.print')}</button>
    </div>`;
}

function getBranch() { return window.__kitchenBranch || null; }

async function render() {
    try {
        const branch = getBranch();
        const orders = await fetchOrders(branch);
        const pending = orders.filter(o => o.status === 'pending');

        if (!pending.length) {
            page.innerHTML = `<div class="cart-empty">${t('kitchen.empty')}</div>`;
            return;
        }

        page.innerHTML = pending.map(o => renderOrderCard(o)).join('');
    } catch (err) {
        page.innerHTML = `<div class="cart-empty">${err.message}</div>`;
    }
}

page.addEventListener('click', async (e) => {
    const printBtn = e.target.closest('.kitchen-print-btn');
    if (printBtn && !printBtn.disabled) {
        printBtn.disabled = true;
        try {
            await updateOrderStatus(printBtn.dataset.order, 'printed');
            toast.addMessage(`${printBtn.dataset.order} ${t('kitchen.printed')}`, 2000, 'success');
        } catch (err) {
            toast.addMessage(err.message, 3000, 'error');
            printBtn.disabled = false;
        }
    }
});

window.addEventListener('restaurant:orderCreated', render);
window.addEventListener('restaurant:orderUpdated', render);
render();
setInterval(render, 2000);
