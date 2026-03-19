/**
 * Delivery scan page — shows available printed orders for the deliverer to claim.
 * Also allows manual token entry as fallback.
 */

import { t } from './i18n.js';
import { fetchOrders, fetchOrderByToken, updateOrderStatus, updateDelivererStatus } from './restaurant-api.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('delivery-scan-page');
const toast = new ToastMessager();

function getSession() {
    try { return JSON.parse(localStorage.getItem('deliverer-session')); }
    catch { return null; }
}

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function render(error) {
    const session = getSession();
    const errorHtml = error ? `<div class="delivery-error">${error}</div>` : '';

    // Fetch printed orders available for pickup
    let printedOrders = [];
    try {
        const all = await fetchOrders();
        printedOrders = all.filter(o => o.status === 'printed');
    } catch {}

    const ordersHtml = printedOrders.length
        ? printedOrders.map(order => `
            <div class="order-card">
                <div class="order-card-header">
                    <span class="order-number">${t('order.number')}${order.order_number}</span>
                    <span class="order-status status-printed">${t('order.status.printed')}</span>
                </div>
                <div class="order-card-time">${formatTime(order.created_at)}</div>
                <div class="order-card-delivery">${order.delivery_zone || ''} · ${order.delivery_address || ''}</div>
                <div class="order-card-contact">${order.customer_name || ''} · ${order.customer_phone || ''}</div>
                ${order.comment ? `<div class="order-card-comment">${order.comment}</div>` : ''}
                <div class="order-card-footer">
                    <span>${t('cart.grand-total')}</span>
                    <span class="order-total-amount">$${order.total}</span>
                </div>
                <button class="checkout-btn delivery-claim-btn" data-order="${order.order_number}">${t('delivery.claim')}</button>
            </div>
        `).join('')
        : `<div class="cart-empty">${t('delivery.no-task')}</div>`;

    page.innerHTML = `
        <div class="delivery-session-bar">
            <span class="delivery-session-name">${session?.name} · ${session?.phone}</span>
            <button class="cart-remove delivery-logout-btn">${t('deliverer.logout')}</button>
        </div>
        <div class="kitchen-section-title">${t('delivery.scan-title')}</div>
        ${ordersHtml}
        ${errorHtml}
    `;
}

page.addEventListener('click', async (e) => {
    // Logout
    const logoutBtn = e.target.closest('.delivery-logout-btn');
    if (logoutBtn) {
        const session = getSession();
        if (session?.id) {
            try { await updateDelivererStatus(session.id, 'offline'); } catch {}
        }
        localStorage.removeItem('deliverer-session');
        location.reload();
        return;
    }

    // Claim order
    const claimBtn = e.target.closest('.delivery-claim-btn');
    if (claimBtn && !claimBtn.disabled) {
        claimBtn.disabled = true;
        claimBtn.textContent = '...';

        try {
            const session = getSession();
            await updateOrderStatus(claimBtn.dataset.order, 'delivering', { deliverer_id: session?.id });
            if (session?.id) await updateDelivererStatus(session.id, 'delivering');

            toast.addMessage(t('delivery.claimed'), 2000, 'success');
            document.querySelector('[data-sub-navi-item="delivery-task"]')?.click();
        } catch (err) {
            toast.addMessage(err.message, 3000, 'error');
            claimBtn.disabled = false;
            claimBtn.textContent = t('delivery.claim');
        }
    }
});

window.addEventListener('restaurant:orderCreated', () => render());
window.addEventListener('restaurant:orderUpdated', () => render());
render();
setInterval(() => render(), 2000);
