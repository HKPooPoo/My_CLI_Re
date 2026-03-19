/**
 * Kitchen deliverer list page — shows all registered deliverers with status.
 * Allows deleting deliverers.
 */

import { t } from './i18n.js';
import { getDeliverers, deleteDeliverer } from './order-store.js';
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
    const deliverers = await getDeliverers();

    if (!deliverers.length) {
        page.innerHTML = `<div class="cart-empty">${t('deliverer.no-deliverers')}</div>`;
        return;
    }

    page.innerHTML = `
        <div class="deliverer-list">
            ${deliverers.map(d => `
                <div class="deliverer-card">
                    <div class="deliverer-card-header">
                        <span class="deliverer-card-code">${d.code}</span>
                        <span class="order-status ${STATUS_BADGE[d.status] || ''}">${t('deliverer.status.' + d.status)}</span>
                    </div>
                    <div class="deliverer-card-info">
                        <span>${d.name}</span>
                        <span class="deliverer-card-phone">${d.phone}</span>
                    </div>
                    <div class="deliverer-card-actions">
                        <button class="cart-remove deliverer-delete-btn" data-id="${d.id}">${t('deliverer.delete')}</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

page.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.deliverer-delete-btn');
    if (!delBtn) return;

    const id = Number(delBtn.dataset.id);

    // Two-click confirm pattern
    if (armedDeleteId === id) {
        clearTimeout(armTimer);
        armedDeleteId = null;
        await deleteDeliverer(id);
        toast.addMessage(t('deliverer.delete'), 2000, 'info');
        return;
    }

    // Arm
    armedDeleteId = id;
    delBtn.textContent = t('deliverer.delete-confirm');
    delBtn.classList.add('armed');
    armTimer = setTimeout(() => {
        armedDeleteId = null;
        delBtn.textContent = t('deliverer.delete');
        delBtn.classList.remove('armed');
    }, 3000);
});

window.addEventListener('deliverer:changed', render);
render();
