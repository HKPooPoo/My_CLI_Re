/**
 * Console page — dev tools for testing the delivery prototype.
 * Works on all interfaces (menu, kitchen, deliverer).
 * Simulate orders, clear data.
 */

import { t } from './i18n.js';
import { addItem, clear as clearCart, getCount } from './cart.js';
import { itemTotal, getItems } from './cart.js';
import { createOrder, clearOrders } from './order-store.js';
import { submitOrder, fetchOrders as apiFetchOrders } from './restaurant-api.js';
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
            await addItem('滷肉飯', 52, [
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
            // Save to IndexedDB
            await createOrder({
                items,
                deliveryZone: '屯門市中心',
                deliveryAddress: '測試路 1 號',
                deliveryFee: 0,
                distanceKm: 1.5,
                customerName: '測試員',
                customerPhone: '91234567',
                subtotal: items.reduce((s, i) => s + i.subtotal, 0),
            });
            // Also submit to API
            try {
                const apiOrder = await submitOrder({
                    items: items.map(i => ({ name: i.name, subtotal: i.subtotal, options: i.options })),
                    delivery_zone: '屯門市中心',
                    delivery_address: '測試路 1 號',
                    delivery_fee: 0,
                    distance_km: 1.5,
                    customer_name: '測試員',
                    customer_phone: '91234567',
                });
                toast.addMessage(`${t('order.number')}${apiOrder.order_number}`, 3000, 'success');
            } catch {
                toast.addMessage(t('console.simulate-order'), 3000, 'info');
            }
            await clearCart();
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
            localStorage.removeItem('delivery-info');
            localStorage.removeItem('deliverer-session');
            localStorage.removeItem('kitchen-session');
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
            localStorage.removeItem('delivery-info');
            localStorage.removeItem('deliverer-session');
            localStorage.removeItem('kitchen-session');
            toast.addMessage(t('console.db-reset'), 2000, 'info');
            setTimeout(() => location.reload(), 1000);
        }
    },
];

/* ── Render ── */

async function render() {
    // Fetch from API for the printed orders section
    let printedHtml = '';
    try {
        const orders = await apiFetchOrders();
        const printed = orders.filter(o => o.status === 'printed');
        printedHtml = printed.length
            ? printed.map(o => `
                <div class="console-info">
                    <span class="console-info-label">${t('order.number')}${o.order_number}</span>
                    <span class="console-info-value">${o.status}</span>
                </div>
            `).join('')
            : `<div class="console-info"><span class="console-info-label">${t('console.no-ready')}</span></div>`;
    } catch {
        printedHtml = `<div class="console-info"><span class="console-info-label">${t('console.no-ready')}</span></div>`;
    }

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
            <div class="console-title">${t('console.tokens-title')}</div>
            <div class="console-section">
                ${printedHtml}
            </div>
        </div>
    `;
}

/* ── Event handling ── */

page.addEventListener('click', async (e) => {
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
});

window.addEventListener('order:created', render);
window.addEventListener('order:statusChanged', render);
window.addEventListener('restaurant:orderCreated', render);
window.addEventListener('restaurant:orderUpdated', render);
render();
