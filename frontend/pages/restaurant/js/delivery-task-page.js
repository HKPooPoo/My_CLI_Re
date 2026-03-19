/**
 * Delivery task page — shows the deliverer's current active delivery.
 * Actions: mark delivered.
 */

import { t } from './i18n.js';
import { getOrdersByDeliverer, updateStatus, getDelivererSession, updateDelivererStatus } from './order-store.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('delivery-task-page');
const toast = new ToastMessager();

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function render() {
    const session = getDelivererSession();
    if (!session) return;

    const orders = await getOrdersByDeliverer(session.id);
    const active = orders.filter(o => o.status === 'delivering');

    if (!active.length) {
        page.innerHTML = `<div class="cart-empty">${t('delivery.no-task')}</div>`;
        return;
    }

    page.innerHTML = active.map(order => `
        <div class="delivery-info-card">
            <div class="delivery-info-header">
                <span class="order-number">${t('order.number')}${order.orderNumber}</span>
                <span class="order-status status-${order.status}">${t('order.status.' + order.status)}</span>
            </div>
            <div class="order-card-time">${formatTime(order.createdAt)}</div>
            <div class="delivery-info-section">
                <div class="delivery-info-label">${t('delivery.customer')}</div>
                <div class="delivery-info-value">${order.customerName}</div>
            </div>
            <div class="delivery-info-section">
                <div class="delivery-info-label">${t('delivery.phone')}</div>
                <div class="delivery-info-value delivery-phone">${order.customerPhone}</div>
            </div>
            <div class="delivery-info-section">
                <div class="delivery-info-label">${t('delivery.address')}</div>
                <div class="delivery-info-value">${order.deliveryZone} · ${order.deliveryAddress}</div>
            </div>
            <div class="delivery-map-placeholder">
                <div class="delivery-map-text">${t('delivery.map-placeholder')}</div>
            </div>
            <div class="delivery-info-section">
                <div class="delivery-info-label">${t('order.est-time')}</div>
                <div class="delivery-info-value">~${order.estimatedMinutes} ${t('order.minutes')}</div>
            </div>
            <div class="delivery-items-summary">
                ${(order.items || []).map(item => `
                    <div class="order-item-row">
                        <span>${item.name}</span>
                        <span>$${item.subtotal}</span>
                    </div>
                `).join('')}
                <div class="order-card-footer">
                    <span>${t('cart.grand-total')}</span>
                    <span class="order-total-amount">$${order.total}</span>
                </div>
            </div>
            <button class="checkout-btn delivery-action-btn" data-order="${order.orderNumber}">${t('delivery.mark-delivered')}</button>
        </div>
    `).join('');
}

page.addEventListener('click', async (e) => {
    const btn = e.target.closest('.delivery-action-btn');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    btn.textContent = '...';

    await updateStatus(btn.dataset.order, 'delivered');

    // Check if deliverer has more active orders
    const session = getDelivererSession();
    if (session?.id) {
        const orders = await getOrdersByDeliverer(session.id);
        const stillActive = orders.filter(o => o.status === 'delivering');
        if (!stillActive.length) {
            await updateDelivererStatus(session.id, 'idle');
        }
    }

    toast.addMessage(t('delivery.complete'), 2000, 'success');
});

window.addEventListener('order:statusChanged', render);
render();
