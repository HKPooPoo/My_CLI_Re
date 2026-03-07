/**
 * Kitchen page — polls server for today's orders, allows marking as ready.
 */

import { t } from './i18n.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('kitchen-orders-page');
const toast = new ToastMessager();
let pollTimer = null;
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

function render(orders) {
    if (!orders.length) {
        page.innerHTML = `<div class="cart-empty">${t('kitchen.empty')}</div>`;
        return;
    }

    page.innerHTML = orders.map(order => `
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
            ${order.status === 'preparing' ? `
                <button class="kitchen-ready-btn" data-order="${order.order_number}">${t('kitchen.mark-ready')}</button>
            ` : ''}
        </div>
    `).join('');
}

async function refresh() {
    try {
        const orders = await fetchOrders();
        render(orders);
    } catch (err) {
        console.warn('Kitchen fetch failed:', err);
    }
}

page.addEventListener('click', async (e) => {
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

// Start polling when kitchen page becomes visible
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
    if (e.detail?.page === 'kitchen-orders') {
        startPolling();
    } else {
        stopPolling();
    }
});

// Initial render
render([]);
