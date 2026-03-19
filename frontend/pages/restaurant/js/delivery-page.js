/**
 * Delivery scan page — enter pickup code (qrToken) to claim an order.
 * Deliverer is already authenticated via session.
 */

import { t } from './i18n.js';
import { getOrderByToken, updateStatus, getDelivererSession, clearDelivererSession, updateDelivererStatus } from './order-store.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('delivery-scan-page');
const toast = new ToastMessager();

function render(error) {
    const session = getDelivererSession();
    const errorHtml = error ? `<div class="delivery-error">${error}</div>` : '';
    page.innerHTML = `
        <div class="delivery-session-bar">
            <span class="delivery-session-name">${session?.code} · ${session?.name}</span>
            <button class="cart-remove delivery-logout-btn">${t('deliverer.logout')}</button>
        </div>
        <div class="delivery-form">
            <div class="delivery-form-title">${t('delivery.scan-title')}</div>
            <div class="checkout-field">
                <label class="checkout-label">${t('delivery.enter-token')}</label>
                <input type="text" id="scan-token" class="checkout-input" placeholder="${t('delivery.scan-placeholder')}" autocomplete="off">
            </div>
            ${errorHtml}
            <button class="checkout-btn" id="scan-submit">${t('delivery.claim')}</button>
        </div>
    `;
}

page.addEventListener('click', async (e) => {
    // Logout
    const logoutBtn = e.target.closest('.delivery-logout-btn');
    if (logoutBtn) {
        const session = getDelivererSession();
        if (session?.id) await updateDelivererStatus(session.id, 'offline');
        clearDelivererSession();
        location.reload();
        return;
    }

    // Claim delivery
    const submitBtn = e.target.closest('#scan-submit');
    if (!submitBtn || submitBtn.disabled) return;

    const token = document.getElementById('scan-token')?.value.trim();
    if (!token) {
        render(t('delivery.fill-all'));
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '...';

    const order = await getOrderByToken(token);
    if (!order) {
        render(t('delivery.invalid-token'));
        return;
    }

    if (order.status !== 'printed') {
        render(t('delivery.order-not-ready'));
        return;
    }

    const session = getDelivererSession();
    await updateStatus(order.orderNumber, 'delivering', { delivererId: session?.id });
    if (session?.id) await updateDelivererStatus(session.id, 'delivering');
    toast.addMessage(t('delivery.claimed'), 2000, 'success');

    // Navigate to task page
    document.querySelector('[data-sub-navi-item="delivery-task"]')?.click();
    render();
});

render();
