/**
 * Kitchen console — API-only dev tools. No IndexedDB dependency.
 */

import { t } from './i18n.js';
import { fetchOrders } from './restaurant-api.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('dev-tools-page');
const toast = new ToastMessager();

import { BRANCH } from './branch.js';

let rendering = false;

function getSession() {
    try { return JSON.parse(localStorage.getItem('kitchen-session')); }
    catch { return null; }
}

async function render() {
    if (rendering) return;
    rendering = true;
    const session = getSession();
    const branch = BRANCH;

    let printedHtml = '';
    try {
        const orders = await fetchOrders(branch);
        const printed = orders.filter(o => o.status === 'printed');
        printedHtml = printed.length
            ? printed.map(o => `
                <div class="console-info">
                    <span class="console-info-label">${t('order.number')}${o.order_number}</span>
                </div>
            `).join('')
            : `<div class="console-info"><span class="console-info-label">${t('console.no-ready')}</span></div>`;
    } catch {
        printedHtml = `<div class="console-info"><span class="console-info-label">${t('console.no-ready')}</span></div>`;
    }

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
    `;
    rendering = false;
}

page.addEventListener('click', (e) => {
    if (e.target.closest('.kitchen-logout-btn')) {
        localStorage.removeItem('kitchen-session');
        location.reload();
    }
});

window.addEventListener('restaurant:orderCreated', render);
window.addEventListener('restaurant:orderUpdated', render);
render();
setInterval(render, 2000);
