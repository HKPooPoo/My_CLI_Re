/**
 * Kitchen page — instant sync via WebSocket (Reverb/Echo).
 * Branch-scoped: only shows orders for the bound branch.
 * Pending: preparing orders with "完成" button.
 * History: completed orders (read-only).
 */

import { t } from './i18n.js';
import { getEcho } from './echo-service.js';
import { ToastMessager } from '/javascript/toast.js';

const pendingPage = document.getElementById('kitchen-orders-page');
const historyPage = document.getElementById('kitchen-history-page');
const toast = new ToastMessager();

function getKitchenBranch() {
    return localStorage.getItem('kitchen-branch') || null;
}

async function fetchOrders() {
    const branch = getKitchenBranch();
    const url = branch
        ? `/api/restaurant/orders?branch=${encodeURIComponent(branch)}`
        : '/api/restaurant/orders';
    const res = await fetch(url, {
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
    const tableInfo = order.table_number ? ` · Table ${order.table_number}` : '';
    return `
        <div class="order-card kitchen-card ${order.status === 'ready' ? 'kitchen-done' : ''}">
            <div class="order-card-header">
                <span class="order-number">${order.order_number}${tableInfo}</span>
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
    const branch = getKitchenBranch();
    const titleHtml = branch
        ? `<div class="kitchen-branch-title">${branch} ${t('nav.kitchen')}</div>`
        : '';

    const pending = orders.filter(o => o.status === 'preparing');
    if (!pending.length) {
        pendingPage.innerHTML = titleHtml + `<div class="cart-empty">${t('kitchen.empty')}</div>`;
        return;
    }
    pendingPage.innerHTML = titleHtml + pending.map(o => renderOrderCard(o, true)).join('');
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
    } catch (err) {
        toast.addMessage(err.message, 3000, 'error');
        btn.disabled = false;
    }
});

// Subscribe to branch-scoped WebSocket channel
let currentChannel = null;

async function subscribe() {
    try {
        const echo = await getEcho();
        const branch = getKitchenBranch();
        const channelName = branch
            ? `restaurant-orders.${branch}`
            : 'restaurant-orders';

        if (currentChannel) {
            echo.leave(currentChannel);
        }
        currentChannel = channelName;

        echo.channel(channelName)
            .listen('.restaurant.order.updated', () => {
                refresh();
            });
    } catch (err) {
        console.warn('Echo subscribe failed, falling back to polling:', err);
        setInterval(refresh, 5000);
    }
}

// Re-subscribe when kitchen branch changes
window.addEventListener('kitchen:branchChanged', () => {
    refresh();
    subscribe();
});

// Initial load + subscribe
refresh();
subscribe();
