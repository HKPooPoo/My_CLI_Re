/**
 * Kitchen orders page — FIFO queue with accept/reject/ready controls.
 * Reads orders from IndexedDB. No API calls (static prototype).
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
    const isPending = order.status === 'pending';
    const isPreparing = order.status === 'preparing';
    const isReady = order.status === 'ready';
    const isDone = ['delivering', 'delivered'].includes(order.status);
    const isRejected = order.status === 'rejected';

    let actionsHtml = '';
    if (isPending) {
        actionsHtml = `
            <div class="kitchen-actions">
                <button class="kitchen-btn kitchen-accept-btn" data-order="${order.orderNumber}">${t('kitchen.accept')}</button>
                <button class="kitchen-btn kitchen-reject-btn" data-order="${order.orderNumber}">${t('kitchen.reject')}</button>
            </div>`;
    } else if (isPreparing) {
        actionsHtml = `
            <button class="kitchen-btn kitchen-ready-btn" data-order="${order.orderNumber}">${t('kitchen.mark-ready')}</button>`;
    } else if (isReady && order.qrToken) {
        actionsHtml = `
            <div class="kitchen-qr-section">
                <div class="kitchen-qr-label">${t('kitchen.qr-token')}</div>
                <div class="kitchen-qr-code">${order.qrToken}</div>
            </div>`;
    }

    const rejectHtml = isRejected && order.rejectReason
        ? `<div class="order-card-reject">${order.rejectReason}</div>`
        : '';

    const doneClass = (isDone || isRejected) ? 'kitchen-done' : '';

    return `
    <div class="order-card kitchen-card ${doneClass}">
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
        ${rejectHtml}
        ${actionsHtml}
    </div>`;
}

async function render() {
    const orders = await getOrders();
    // FIFO: oldest first. Show active orders (pending, preparing, ready) then completed
    const active = orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status));
    const done = orders.filter(o => ['delivering', 'delivered', 'rejected'].includes(o.status));

    if (!active.length && !done.length) {
        page.innerHTML = `<div class="cart-empty">${t('kitchen.empty')}</div>`;
        return;
    }

    const activeHtml = active.map(o => renderOrderCard(o)).join('');
    const doneHtml = done.length
        ? `<div class="kitchen-section-title">${t('kitchen.history')}</div>` + done.reverse().map(o => renderOrderCard(o)).join('')
        : '';

    page.innerHTML = activeHtml + doneHtml;
}

// Event delegation
page.addEventListener('click', async (e) => {
    const acceptBtn = e.target.closest('.kitchen-accept-btn');
    if (acceptBtn && !acceptBtn.disabled) {
        acceptBtn.disabled = true;
        await updateStatus(acceptBtn.dataset.order, 'preparing');
        toast.addMessage(`${acceptBtn.dataset.order} ${t('order.status.preparing')}`, 2000, 'success');
        return;
    }

    const rejectBtn = e.target.closest('.kitchen-reject-btn');
    if (rejectBtn && !rejectBtn.disabled) {
        const reason = prompt(t('kitchen.reject-reason-prompt'));
        if (reason === null) return; // cancelled
        rejectBtn.disabled = true;
        await updateStatus(rejectBtn.dataset.order, 'rejected', reason || t('kitchen.default-reject'));
        toast.addMessage(`${rejectBtn.dataset.order} ${t('order.status.rejected')}`, 2000, 'info');
        return;
    }

    const readyBtn = e.target.closest('.kitchen-ready-btn');
    if (readyBtn && !readyBtn.disabled) {
        readyBtn.disabled = true;
        const order = await updateStatus(readyBtn.dataset.order, 'ready');
        toast.addMessage(`${readyBtn.dataset.order} ${t('order.status.ready')} — ${t('kitchen.qr-token')}: ${order?.qrToken}`, 4000, 'success');
        return;
    }
});

window.addEventListener('order:created', render);
window.addEventListener('order:statusChanged', render);
render();
