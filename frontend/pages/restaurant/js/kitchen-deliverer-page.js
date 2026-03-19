/**
 * Kitchen deliverer list page — fetches deliverers from API.
 */

import { t } from './i18n.js';
import { fetchDeliverers, deleteDeliverer } from './restaurant-api.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('deliverer-list-page');
const toast = new ToastMessager();

const STATUS_BADGE = {
    idle: 'status-ready',
    delivering: 'status-delivering',
    offline: 'status-rejected',
};

let armedDeleteId = null;
let armTimer = null;

async function render() {
    try {
        const deliverers = await fetchDeliverers();

        if (!deliverers.length) {
            page.innerHTML = `<div class="cart-empty">${t('deliverer.no-deliverers')}</div>`;
            return;
        }

        page.innerHTML = `
            <div class="deliverer-list">
                ${deliverers.map(d => `
                    <div class="deliverer-card">
                        <div class="deliverer-card-header">
                            <span class="deliverer-card-name">${d.name}</span>
                            <span class="order-status ${STATUS_BADGE[d.status] || ''}">${t('deliverer.status.' + d.status)}</span>
                        </div>
                        <div class="deliverer-card-info">
                            <span class="deliverer-card-phone">${d.phone}</span>
                        </div>
                        <div class="deliverer-card-actions">
                            <button class="cart-remove deliverer-delete-btn" data-id="${d.id}">${t('deliverer.delete')}</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (err) {
        page.innerHTML = `<div class="cart-empty">${err.message}</div>`;
    }
}

page.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.deliverer-delete-btn');
    if (!delBtn) return;

    const id = Number(delBtn.dataset.id);

    if (armedDeleteId === id) {
        clearTimeout(armTimer);
        armedDeleteId = null;
        try {
            await deleteDeliverer(id);
            toast.addMessage(t('deliverer.delete'), 2000, 'info');
            render();
        } catch (err) {
            toast.addMessage(err.message, 3000, 'error');
        }
        return;
    }

    armedDeleteId = id;
    delBtn.textContent = t('deliverer.delete-confirm');
    delBtn.classList.add('armed');
    armTimer = setTimeout(() => {
        armedDeleteId = null;
        delBtn.textContent = t('deliverer.delete');
        delBtn.classList.remove('armed');
    }, 3000);
});

window.addEventListener('restaurant:orderUpdated', render);
render();
setInterval(render, 2000);
