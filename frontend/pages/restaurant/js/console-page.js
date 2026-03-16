/**
 * Console page — dev tools for testing the delivery prototype.
 * Simulate orders, scans, manage PIN, clear data.
 */

import { t } from './i18n.js';
import { addItem, clear as clearCart, getCount } from './cart.js';
import { itemTotal, getItems } from './cart.js';
import { createOrder, getOrders, clearOrders, getDeliveryPin, setDeliveryPin } from './order-store.js';
import db from './db.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('dev-tools-page');
const toast = new ToastMessager();

/* ── Dev action definitions ── */

const devButtons = [
    {
        label: () => t('console.add-test-item'),
        cls: '',
        async action() {
            await addItem('滷肉飯', 42, [
                {
                    key: 'drink', label: '飲品', choices: [
                        { label: '咖啡', extra: 0 },
                        { label: '朱古力', extra: 0 },
                        { label: '可口可樂', extra: 2 },
                    ]
                },
            ]);
            toast.addMessage(`${t('console.added')} (${getCount()})`, 2000, 'success');
        }
    },
    {
        label: () => t('console.simulate-order'),
        cls: '',
        async action() {
            await addItem('測試餐', 55, []);
            const items = getItems().map(item => ({
                name: item.name, subtotal: itemTotal(item), options: {},
            }));
            const order = await createOrder({
                items,
                deliveryZone: '屯門市中心',
                deliveryAddress: '測試路 1 號',
                deliveryFee: 0,
                distanceKm: 1.5,
                customerName: '測試員',
                customerPhone: '91234567',
                subtotal: items.reduce((s, i) => s + i.subtotal, 0),
            });
            await clearCart();
            toast.addMessage(`${t('order.number')}${order.orderNumber}`, 3000, 'success');
        }
    },
    {
        label: () => t('console.clear-cart'),
        cls: 'dev-btn-warn',
        async action() {
            await clearCart();
            toast.addMessage(t('console.cart-cleared'), 2000, 'info');
        }
    },
    {
        label: () => t('console.clear-orders'),
        cls: 'dev-btn-warn',
        async action() {
            await clearOrders();
            toast.addMessage(t('console.orders-cleared'), 2000, 'info');
        }
    },
    {
        label: () => t('console.clear-all'),
        cls: 'dev-btn-danger',
        async action() {
            await clearCart();
            await clearOrders();
            localStorage.removeItem('menu-unavailable');
            localStorage.removeItem('active-delivery-token');
            window.dispatchEvent(new CustomEvent('menu:availabilityChanged'));
            toast.addMessage(t('console.all-cleared'), 2000, 'info');
        }
    },
    {
        label: () => t('console.reset-db'),
        cls: 'dev-btn-danger',
        async action() {
            await db.delete();
            localStorage.removeItem('order-counter');
            localStorage.removeItem('menu-unavailable');
            localStorage.removeItem('active-delivery-token');
            localStorage.removeItem('delivery-pin');
            toast.addMessage(t('console.db-reset'), 2000, 'info');
            setTimeout(() => location.reload(), 1000);
        }
    },
];

/* ── Render ── */

async function render() {
    const pin = getDeliveryPin();
    const orders = await getOrders();
    const readyOrders = orders.filter(o => o.status === 'ready' && o.qrToken);

    const readyOrdersHtml = readyOrders.length
        ? readyOrders.map(o => `
            <div class="console-info">
                <span class="console-info-label">${o.orderNumber}</span>
                <span class="console-info-value">${o.qrToken}</span>
            </div>
        `).join('')
        : `<div class="console-info"><span class="console-info-label">${t('console.no-ready')}</span></div>`;

    page.innerHTML = `
        <div class="console-container">
            <div class="console-title">${t('console.title')}</div>
            <div class="console-buttons">
                ${devButtons.map((btn, i) => `
                    <button class="dev-btn ${btn.cls}" data-idx="${i}">${btn.label()}</button>
                `).join('')}
            </div>
        </div>

        <div class="console-container">
            <div class="console-title">${t('console.pin-title')}</div>
            <div class="console-section">
                <div class="console-info">
                    <span class="console-info-label">${t('console.current-pin')}</span>
                    <span class="console-info-value">${pin}</span>
                </div>
                <div class="console-field-row">
                    <input id="new-pin" type="text" class="console-input" maxlength="4" placeholder="${t('console.new-pin')}" inputmode="numeric">
                    <button class="dev-btn" data-action="set-pin" style="flex:0 0 auto;width:auto;padding:8px 16px">${t('console.set-pin')}</button>
                </div>
            </div>
        </div>

        <div class="console-container">
            <div class="console-title">${t('console.tokens-title')}</div>
            <div class="console-section">
                ${readyOrdersHtml}
            </div>
        </div>
    `;
}

/* ── Event handling ── */

page.addEventListener('click', async (e) => {
    // Dev buttons
    const devBtn = e.target.closest('.dev-btn[data-idx]');
    if (devBtn && !devBtn.disabled) {
        const idx = Number(devBtn.dataset.idx);
        const def = devButtons[idx];
        if (!def) return;
        devBtn.disabled = true;
        try {
            await def.action();
            render();
        } finally {
            devBtn.disabled = false;
        }
        return;
    }

    // Set PIN
    const pinBtn = e.target.closest('[data-action="set-pin"]');
    if (pinBtn) {
        const input = document.getElementById('new-pin');
        const val = input?.value.trim();
        if (val && val.length === 4) {
            setDeliveryPin(val);
            toast.addMessage(`PIN → ${val}`, 2000, 'success');
            render();
        } else {
            toast.addMessage(t('console.pin-invalid'), 2000, 'error');
        }
        return;
    }
});

window.addEventListener('order:created', render);
window.addEventListener('order:statusChanged', render);
render();
