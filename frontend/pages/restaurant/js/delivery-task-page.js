/**
 * Delivery task page — shows active deliveries from API.
 */

import { t } from './i18n.js';
import { fetchOrdersByDeliverer, updateOrderStatus, updateDelivererStatus } from './restaurant-api.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('delivery-task-page');
const toast = new ToastMessager();
let rendering = false;

function getSession() {
    try { return JSON.parse(localStorage.getItem('deliverer-session')); }
    catch { return null; }
}

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function render() {
    if (rendering) return;
    rendering = true;
    const session = getSession();
    if (!session) { rendering = false; return; }

    try {
        const orders = await fetchOrdersByDeliverer(session.id);
        const active = orders.filter(o => o.status === 'delivering');

        if (!active.length) {
            page.innerHTML = `<div class="cart-empty">${t('delivery.no-task')}</div>`;
            return;
        }

        page.innerHTML = active.map(order => `
            <div class="delivery-info-card">
                <div class="delivery-info-header">
                    <span class="order-number">${t('order.number')}${order.order_number}</span>
                    <span class="order-status status-${order.status}">${t('order.status.' + order.status)}</span>
                </div>
                <div class="order-card-time">${formatTime(order.created_at)}</div>
                <div class="delivery-info-section">
                    <div class="delivery-info-label">${t('delivery.customer')}</div>
                    <div class="delivery-info-value">${order.customer_name || ''}</div>
                </div>
                <div class="delivery-info-section">
                    <div class="delivery-info-label">${t('delivery.phone')}</div>
                    <div class="delivery-info-value delivery-phone">${order.customer_phone || ''}</div>
                </div>
                <div class="delivery-info-section">
                    <div class="delivery-info-label">${t('delivery.address')}</div>
                    <div class="delivery-info-value">${order.delivery_zone || ''} · ${order.delivery_address || ''}</div>
                </div>
                ${order.comment ? `<div class="delivery-info-section"><div class="delivery-info-label">${t('cart.comment')}</div><div class="delivery-info-value order-card-comment">${order.comment}</div></div>` : ''}
                <div class="delivery-map-placeholder">
                    <div class="delivery-map-text">${t('delivery.map-placeholder')}</div>
                </div>
                <div class="delivery-info-section">
                    <div class="delivery-info-label">${t('order.est-time')}</div>
                    <div class="delivery-info-value">~${order.estimated_minutes || '?'} ${t('order.minutes')}</div>
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
                <button class="checkout-btn delivery-action-btn" data-order="${order.order_number}">${t('delivery.mark-delivered')}</button>
            </div>
        `).join('');
    } catch (err) {
        page.innerHTML = `<div class="cart-empty">${err.message}</div>`;
    } finally {
        rendering = false;
    }
}

page.addEventListener('click', async (e) => {
    const btn = e.target.closest('.delivery-action-btn');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    btn.textContent = '...';

    try {
        await updateOrderStatus(btn.dataset.order, 'delivered');

        const session = getSession();
        if (session?.id) {
            const orders = await fetchOrdersByDeliverer(session.id);
            const stillActive = orders.filter(o => o.status === 'delivering');
            if (!stillActive.length) {
                await updateDelivererStatus(session.id, 'idle');
            }
        }

        toast.addMessage(t('delivery.complete'), 2000, 'success');
    } catch (err) {
        toast.addMessage(err.message, 3000, 'error');
        btn.disabled = false;
        btn.textContent = t('delivery.mark-delivered');
    }
});

window.addEventListener('restaurant:orderUpdated', render);
render();
setInterval(render, 2000);
