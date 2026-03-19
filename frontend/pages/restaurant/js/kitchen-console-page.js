/**
 * Kitchen console — admin tools for managing restaurant data.
 * PostgreSQL-only (no IndexedDB). Behind kitchen login gate.
 */

import { t } from './i18n.js';
import { BRANCH } from './branch.js';
import { fetchOrders, clearAllOrders, fetchDeliverers, deleteDeliverer } from './restaurant-api.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('dev-tools-page');
const toast = new ToastMessager();

let rendering = false;
let armedAction = null;
let armTimer = null;

function getSession() {
    try { return JSON.parse(localStorage.getItem('kitchen-session')); }
    catch { return null; }
}

function resetArmed() {
    armedAction = null;
    clearTimeout(armTimer);
}

async function render() {
    if (rendering) return;
    rendering = true;
    const session = getSession();

    // Fetch stats
    let orderCount = 0;
    let printedOrders = [];
    let delivererCount = 0;
    try {
        const orders = await fetchOrders(BRANCH);
        orderCount = orders.length;
        printedOrders = orders.filter(o => o.status === 'printed');
    } catch {}
    try {
        const deliverers = await fetchDeliverers();
        delivererCount = deliverers.length;
    } catch {}

    const printedHtml = printedOrders.length
        ? printedOrders.map(o => `
            <div class="console-info">
                <span class="console-info-label">${t('order.number')}${o.order_number}</span>
                <span class="console-info-value">${o.delivery_zone || ''}</span>
            </div>
        `).join('')
        : `<div class="console-info"><span class="console-info-label">${t('console.no-ready')}</span></div>`;

    page.innerHTML = `
        <div class="delivery-session-bar">
            <span class="delivery-session-name">${session?.code || '—'} · ${session?.name || '—'}</span>
            <button class="cart-remove kitchen-logout-btn">${t('deliverer.logout')}</button>
        </div>

        <div class="console-container">
            <div class="console-title">${t('console.tokens-title')}</div>
            <div class="console-section">
                ${printedHtml}
            </div>
        </div>

        <div class="console-container">
            <div class="console-title">${t('console.stats-title')}</div>
            <div class="console-section">
                <div class="console-info">
                    <span class="console-info-label">${t('console.today-orders')}</span>
                    <span class="console-info-value">${orderCount}</span>
                </div>
                <div class="console-info">
                    <span class="console-info-label">${t('console.deliverer-count')}</span>
                    <span class="console-info-value">${delivererCount}</span>
                </div>
                <div class="console-info">
                    <span class="console-info-label">${t('console.branch')}</span>
                    <span class="console-info-value">${BRANCH || '—'}</span>
                </div>
            </div>
        </div>

        <div class="console-container">
            <div class="console-title">${t('console.danger-zone')}</div>
            <div class="console-buttons">
                <button class="dev-btn dev-btn-warn" data-action="clear-orders">${t('console.clear-orders')}</button>
                <button class="dev-btn dev-btn-warn" data-action="clear-deliverers">${t('console.clear-deliverers')}</button>
                <button class="dev-btn dev-btn-danger" data-action="clear-all">${t('console.clear-all')}</button>
            </div>
        </div>
    `;
    rendering = false;
}

page.addEventListener('click', async (e) => {
    // Logout
    if (e.target.closest('.kitchen-logout-btn')) {
        localStorage.removeItem('kitchen-session');
        location.reload();
        return;
    }

    // Dev action buttons (armed confirm pattern)
    const actionBtn = e.target.closest('.dev-btn[data-action]');
    if (!actionBtn || actionBtn.disabled) return;

    const action = actionBtn.dataset.action;

    // Second click = execute
    if (armedAction === action) {
        resetArmed();
        actionBtn.disabled = true;
        actionBtn.textContent = '...';

        try {
            if (action === 'clear-orders') {
                const result = await clearAllOrders(BRANCH);
                toast.addMessage(`${t('console.orders-cleared')} (${result.deleted})`, 3000, 'success');
            } else if (action === 'clear-deliverers') {
                const deliverers = await fetchDeliverers();
                for (const d of deliverers) await deleteDeliverer(d.id);
                toast.addMessage(`${t('console.deliverers-cleared')} (${deliverers.length})`, 3000, 'success');
            } else if (action === 'clear-all') {
                const result = await clearAllOrders(BRANCH);
                const deliverers = await fetchDeliverers();
                for (const d of deliverers) await deleteDeliverer(d.id);
                toast.addMessage(`${t('console.all-cleared')} (${result.deleted} + ${deliverers.length})`, 3000, 'success');
            }
        } catch (err) {
            toast.addMessage(err.message, 3000, 'error');
        }
        render();
        return;
    }

    // First click = arm
    resetArmed();
    armedAction = action;
    const originalText = actionBtn.textContent;
    actionBtn.textContent = t('console.confirm-action');
    actionBtn.classList.add('armed');
    armTimer = setTimeout(() => {
        armedAction = null;
        actionBtn.textContent = originalText;
        actionBtn.classList.remove('armed');
    }, 3000);
});

window.addEventListener('restaurant:orderCreated', render);
window.addEventListener('restaurant:orderUpdated', render);
render();
setInterval(render, 2000);
