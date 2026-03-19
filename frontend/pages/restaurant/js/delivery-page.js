/**
 * Delivery scan page — mock scan button + manual code entry to claim orders.
 */

import { t } from './i18n.js';
import { BRANCH } from './branch.js';
import { fetchOrders, updateOrderStatus, updateDelivererStatus, logoutDeliverer } from './restaurant-api.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('delivery-scan-page');
const toast = new ToastMessager();

function getSession() {
    try { return JSON.parse(localStorage.getItem('deliverer-session')); }
    catch { return null; }
}

function render(error) {
    const session = getSession();
    const errorHtml = error ? `<div class="delivery-error">${error}</div>` : '';
    page.innerHTML = `
        <div class="delivery-session-bar">
            <span class="delivery-session-name">${session?.name} · ${session?.phone}</span>
            <button class="cart-remove delivery-logout-btn">${t('deliverer.logout')}</button>
        </div>
        <div class="delivery-form">
            <div class="delivery-form-title">${t('delivery.scan-title')}</div>
            <button class="checkout-btn scan-mock-btn">${t('delivery.scan-btn')}</button>
            <div class="scan-divider">${t('delivery.or-manual')}</div>
            <div class="checkout-field">
                <label class="checkout-label">${t('delivery.enter-token')}</label>
                <input type="text" id="scan-token" class="checkout-input" placeholder="${t('delivery.scan-placeholder')}" autocomplete="off">
            </div>
            ${errorHtml}
            <button class="checkout-btn" id="scan-submit">${t('delivery.claim')}</button>
        </div>
    `;
}

async function claimByToken(token) {
    if (!token) {
        render(t('delivery.fill-all'));
        return;
    }

    try {
        const order = await fetchOrderByPickupCode(token);

        if (order.status !== 'printed') {
            render(t('delivery.order-not-ready'));
            return;
        }

        const session = getSession();
        await updateOrderStatus(order.order_number, 'delivering', { deliverer_id: session?.id });
        if (session?.id) await updateDelivererStatus(session.id, 'delivering');

        toast.addMessage(`${t('delivery.claimed')} ${t('order.number')}${order.order_number}`, 3000, 'success');
        document.querySelector('[data-sub-navi-item="delivery-task"]')?.click();
        render();
    } catch (err) {
        render(err.message || t('delivery.invalid-token'));
    }
}

page.addEventListener('click', async (e) => {
    // Logout
    if (e.target.closest('.delivery-logout-btn')) {
        try { await logoutDeliverer(); } catch {}
        localStorage.removeItem('deliverer-session');
        location.reload();
        return;
    }

    // Mock scan button
    if (e.target.closest('.scan-mock-btn')) {
        toast.addMessage(t('delivery.scan-mock'), 2000, 'info');
        return;
    }

    // Manual claim
    const submitBtn = e.target.closest('#scan-submit');
    if (submitBtn && !submitBtn.disabled) {
        submitBtn.disabled = true;
        submitBtn.textContent = '...';
        const token = document.getElementById('scan-token')?.value.trim();
        await claimByToken(token);
        submitBtn.disabled = false;
        submitBtn.textContent = t('delivery.claim');
    }
});

render();
