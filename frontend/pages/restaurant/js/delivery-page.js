/**
 * Delivery scan page — enter pickup code (qrToken) to claim an order via API.
 * Deliverer is already authenticated via session.
 */

import { t } from './i18n.js';
import { fetchOrderByToken, updateOrderStatus, updateDelivererStatus } from './restaurant-api.js';
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

    const submitBtn = e.target.closest('#scan-submit');
    if (!submitBtn || submitBtn.disabled) return;

    const token = document.getElementById('scan-token')?.value.trim();
    if (!token) {
        render(t('delivery.fill-all'));
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '...';

    try {
        const order = await fetchOrderByToken(token);

        if (order.status !== 'printed') {
            render(t('delivery.order-not-ready'));
            return;
        }

        const session = getSession();
        await updateOrderStatus(order.order_number, 'delivering', { deliverer_id: session?.id });
        if (session?.id) await updateDelivererStatus(session.id, 'delivering');

        toast.addMessage(t('delivery.claimed'), 2000, 'success');
        document.querySelector('[data-sub-navi-item="delivery-task"]')?.click();
        render();
    } catch (err) {
        render(err.message || t('delivery.invalid-token'));
    }
});

render();
