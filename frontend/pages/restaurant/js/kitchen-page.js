/**
 * Kitchen orders page — simplified FIFO queue.
 * Each order has ONE action: "印單" (print ticket).
 * After printing, order moves to kitchen history page.
 */

import { t } from './i18n.js';
import { getOrders, updateStatus } from './order-store.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('kitchen-orders-page');
const toast = new ToastMessager();

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

function renderOrderCard(order) {
    return `
    <div class="order-card kitchen-card">
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
        <button class="kitchen-btn kitchen-print-btn" data-order="${order.orderNumber}">${t('kitchen.print')}</button>
    </div>`;
}

async function render() {
    const orders = await getOrders();
    const pending = orders.filter(o => o.status === 'pending');

    if (!pending.length) {
        page.innerHTML = `<div class="cart-empty">${t('kitchen.empty')}</div>`;
        return;
    }

    page.innerHTML = pending.map(o => renderOrderCard(o)).join('');
}

page.addEventListener('click', async (e) => {
    const printBtn = e.target.closest('.kitchen-print-btn');
    if (printBtn && !printBtn.disabled) {
        printBtn.disabled = true;
        const order = await updateStatus(printBtn.dataset.order, 'printed');
        toast.addMessage(`${printBtn.dataset.order} ${t('kitchen.printed')}`, 2000, 'success');
        if (order?.qrToken) {
            toast.addMessage(`${t('kitchen.qr-token')}: ${order.qrToken}`, 4000, 'info');
        }
        return;
    }
});

window.addEventListener('order:created', render);
window.addEventListener('order:statusChanged', render);
render();
