/**
 * Delivery page — QR token + PIN entry → delivery info + status controls.
 * Static prototype: no QR camera, just text input for token.
 * Persists active delivery in localStorage for page refresh survival.
 */

import { t } from './i18n.js';
import { getOrderByToken, getDeliveryPin, updateStatus } from './order-store.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('delivery-scan-page');
const toast = new ToastMessager();

const ACTIVE_KEY = 'active-delivery-token';

function getActiveToken() {
    return localStorage.getItem(ACTIVE_KEY);
}

function setActiveToken(token) {
    localStorage.setItem(ACTIVE_KEY, token);
}

function clearActiveToken() {
    localStorage.removeItem(ACTIVE_KEY);
}

/* ── Render: Scan form ── */

function renderScanForm(error) {
    const errorHtml = error ? `<div class="delivery-error">${error}</div>` : '';
    page.innerHTML = `
        <div class="delivery-form">
            <div class="delivery-form-title">${t('delivery.title')}</div>
            <div class="checkout-field">
                <label class="checkout-label">${t('delivery.enter-token')}</label>
                <input type="text" id="delivery-token" class="checkout-input" placeholder="e.g. a1b2c3d4" autocomplete="off">
            </div>
            <div class="checkout-field">
                <label class="checkout-label">${t('delivery.enter-pin')}</label>
                <input type="password" id="delivery-pin" class="checkout-input" maxlength="4" placeholder="****" inputmode="numeric">
            </div>
            ${errorHtml}
            <button class="checkout-btn delivery-verify-btn" id="delivery-verify">${t('delivery.submit')}</button>
        </div>
    `;
}

/* ── Render: Active delivery ── */

function renderDeliveryInfo(order) {
    const statusSteps = ['ready', 'delivering', 'delivered'];
    const currentIdx = statusSteps.indexOf(order.status);

    const stepsHtml = statusSteps.map((s, i) => {
        let cls = 'step-pending';
        if (i < currentIdx) cls = 'step-done';
        else if (i === currentIdx) cls = 'step-active';
        return `<div class="delivery-step ${cls}">${t('order.status.' + s)}</div>`;
    }).join('<div class="delivery-step-arrow">→</div>');

    const isDelivered = order.status === 'delivered';
    let actionHtml = '';
    if (order.status === 'ready') {
        actionHtml = `<button class="checkout-btn delivery-action-btn" data-next="delivering">${t('delivery.pick-up')}</button>`;
    } else if (order.status === 'delivering') {
        actionHtml = `<button class="checkout-btn delivery-action-btn" data-next="delivered">${t('delivery.mark-delivered')}</button>`;
    } else if (isDelivered) {
        actionHtml = `
            <div class="delivery-complete">${t('delivery.complete')}</div>
            <button class="checkout-btn delivery-done-btn">${t('delivery.new-scan')}</button>`;
    }

    page.innerHTML = `
        <div class="delivery-info-card">
            <div class="delivery-info-header">
                <span class="order-number">${t('order.number')}${order.orderNumber}</span>
                <span class="order-status status-${order.status}">${t('order.status.' + order.status)}</span>
            </div>
            <div class="delivery-steps">${stepsHtml}</div>
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
            ${actionHtml}
        </div>
    `;
}

/* ── Events ── */

page.addEventListener('click', async (e) => {
    // Verify button
    const verifyBtn = e.target.closest('#delivery-verify');
    if (verifyBtn) {
        const token = document.getElementById('delivery-token')?.value.trim();
        const pin = document.getElementById('delivery-pin')?.value.trim();

        if (!token || !pin) {
            renderScanForm(t('delivery.fill-all'));
            return;
        }

        if (pin !== getDeliveryPin()) {
            renderScanForm(t('delivery.invalid-pin'));
            return;
        }

        const order = await getOrderByToken(token);
        if (!order) {
            renderScanForm(t('delivery.invalid-token'));
            return;
        }

        if (!['ready', 'delivering'].includes(order.status)) {
            renderScanForm(t('delivery.order-not-ready'));
            return;
        }

        setActiveToken(token);
        renderDeliveryInfo(order);
        return;
    }

    // Status action buttons
    const actionBtn = e.target.closest('.delivery-action-btn');
    if (actionBtn && !actionBtn.disabled) {
        actionBtn.disabled = true;
        const token = getActiveToken();
        const order = await getOrderByToken(token);
        if (!order) return;
        const nextStatus = actionBtn.dataset.next;
        const updated = await updateStatus(order.orderNumber, nextStatus);
        toast.addMessage(`${t('order.status.' + nextStatus)}`, 2000, 'success');
        if (updated) renderDeliveryInfo(updated);
        return;
    }

    // New scan button (after delivery complete)
    const doneBtn = e.target.closest('.delivery-done-btn');
    if (doneBtn) {
        clearActiveToken();
        renderScanForm();
        return;
    }
});

// Listen for external status changes (e.g. from console)
window.addEventListener('order:statusChanged', async () => {
    const token = getActiveToken();
    if (!token) return;
    const order = await getOrderByToken(token);
    if (order) renderDeliveryInfo(order);
});

/* ── Init: restore active delivery or show scan form ── */

async function init() {
    const token = getActiveToken();
    if (token) {
        const order = await getOrderByToken(token);
        if (order && !['delivered', 'rejected'].includes(order.status)) {
            renderDeliveryInfo(order);
            return;
        }
        clearActiveToken();
    }
    renderScanForm();
}

init();
