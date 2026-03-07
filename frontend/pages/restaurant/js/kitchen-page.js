/**
 * Kitchen page — pending orders + history.
 * Pending: polls server every 5s, shows preparing orders with "完成" button.
 * History: shows completed orders (read-only).
 */

import { t } from './i18n.js';
import { ToastMessager } from '/javascript/toast.js';

const pendingPage = document.getElementById('kitchen-orders-page');
const historyPage = document.getElementById('kitchen-history-page');
const toast = new ToastMessager();
let pollTimer = null;
let activePage = null;
const POLL_INTERVAL = 5000;

async function fetchOrders() {
    const res = await fetch('/api/restaurant/orders', {
        headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function markReady(orderNumber) {
    const res = await fetch(`/api/restaurant/orders/${orderNumber}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderOptions(optionsJson) {
    let opts;
    try { opts = typeof optionsJson === 'string' ? JSON.parse(optionsJson) : optionsJson; } catch { return ''; }
    if (!opts || typeof opts !== 'object') return '';
    const entries = Object.entries(opts).filter(([, v]) => v != null);
    if (entries.length === 0) return '';
    return entries.map(([, val]) => {
        const text = Array.isArray(val) ? val.join(', ') : val;
        return `<span class="order-item-option">${text}</span>`;
    }).join('');
}

function renderOrderCard(order, showReadyBtn) {
    return `
        <div class="order-card kitchen-card ${order.status === 'ready' ? 'kitchen-done' : ''}">
            <div class="order-card-header">
                <span class="order-number">${order.order_number}</span>
                <span class="order-status status-${order.status}">${t('order.status.' + order.status)}</span>
            </div>
            <div class="order-card-time">${formatTime(order.created_at)}</div>
            <div class="order-items">
                ${(order.items || []).map(item => `
                    <div class="order-item-row">
                        <span class="order-item-name">${item.name}${item.qty > 1 ? ' ×' + item.qty : ''}</span>
                        <span class="order-item-price">$${item.subtotal}</span>
                    </div>
                    ${renderOptions(item.options) ? `<div class="order-item-options">${renderOptions(item.options)}</div>` : ''}
                `).join('')}
            </div>
            <div class="order-card-footer">
                <span>${t('cart.total')}</span>
                <span class="order-total-amount">$${order.total}</span>
            </div>
            ${showReadyBtn ? `<button class="kitchen-ready-btn" data-order="${order.order_number}">${t('kitchen.mark-ready')}</button>` : ''}
        </div>`;
}

function renderPending(orders) {
    const pending = orders.filter(o => o.status === 'preparing');
    if (!pending.length) {
        pendingPage.innerHTML = `<div class="cart-empty">${t('kitchen.empty')}</div>`;
        return;
    }
    pendingPage.innerHTML = pending.map(o => renderOrderCard(o, true)).join('');
}

function renderHistory(orders) {
    const done = orders.filter(o => o.status === 'ready');
    if (!done.length) {
        historyPage.innerHTML = `<div class="cart-empty">${t('kitchen.history-empty')}</div>`;
        return;
    }
    historyPage.innerHTML = done.reverse().map(o => renderOrderCard(o, false)).join('');
}

async function refresh() {
    try {
        const orders = await fetchOrders();
        renderPending(orders);
        renderHistory(orders);
    } catch (err) {
        console.warn('Kitchen fetch failed:', err);
    }
}

pendingPage.addEventListener('click', async (e) => {
    const btn = e.target.closest('.kitchen-ready-btn');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    try {
        await markReady(btn.dataset.order);
        toast.addMessage(`${btn.dataset.order} ${t('order.status.ready')}`, 2000, 'success');
        await refresh();
    } catch (err) {
        toast.addMessage(err.message, 3000, 'error');
        btn.disabled = false;
    }
});

function startPolling() {
    if (pollTimer) return;
    refresh();
    pollTimer = setInterval(refresh, POLL_INTERVAL);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

window.addEventListener('navi:pageChanged', (e) => {
    activePage = e.detail?.page;
    if (activePage === 'kitchen-orders' || activePage === 'kitchen-history') {
        startPolling();
    } else {
        stopPolling();
    }
});

renderPending([]);
renderHistory([]);
