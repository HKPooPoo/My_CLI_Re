/**
 * Console page — dev testing buttons for restaurant app.
 */

import { t } from './i18n.js';
import { addItem, clear as clearCart, getCount } from './cart.js';
import db from './db.js';
import { render as renderReceipt } from './receipt-page.js';
import { submitOrder } from './order-api.js';
import { saveOrder } from './receipt-page.js';
import { ToastMessager } from '/javascript/toast.js';
import { itemTotal } from './cart.js';

const page = document.getElementById('dev-tools-page');
const toast = new ToastMessager();

const buttons = [
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
                {
                    key: 'topping', label: '加料', choices: [
                        { label: '無', extra: 0 },
                        { label: '珍珠', extra: 2 },
                    ]
                },
            ]);
            toast.addMessage(`${t('console.added')} (${getCount()})`, 2000, 'success');
        }
    },
    {
        label: () => t('console.submit-test-order'),
        cls: '',
        async action() {
            // Create a quick test item, submit, clean up
            await addItem('測試餐', 10, []);
            const { getItems } = await import('./cart.js');
            const items = getItems();
            try {
                const result = await submitOrder(items);
                await saveOrder({
                    order_number: result.order_number,
                    total: result.total,
                    status: result.status,
                    time: new Date().toISOString(),
                    items: items.map(item => ({
                        name: item.name,
                        subtotal: itemTotal(item),
                        options: {},
                    })),
                });
                await clearCart();
                toast.addMessage(`${t('order.number')}${result.order_number}`, 3000, 'success');
            } catch (err) {
                toast.addMessage(err.message, 4000, 'error');
            }
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
            await db.orders.clear();
            await renderReceipt();
            toast.addMessage(t('console.orders-cleared'), 2000, 'info');
        }
    },
    {
        label: () => t('console.clear-all'),
        cls: 'dev-btn-danger',
        async action() {
            await clearCart();
            await db.orders.clear();
            await renderReceipt();
            localStorage.removeItem('restaurant-orders');
            toast.addMessage(t('console.all-cleared'), 2000, 'info');
        }
    },
    {
        label: () => t('console.reset-db'),
        cls: 'dev-btn-danger',
        async action() {
            await db.delete();
            localStorage.removeItem('restaurant-orders');
            toast.addMessage(t('console.db-reset'), 2000, 'info');
            setTimeout(() => location.reload(), 1000);
        }
    },
];

function render() {
    page.innerHTML = `
        <div class="console-container">
            <div class="console-title">${t('console.title')}</div>
            <div class="console-buttons">
                ${buttons.map((btn, i) => `
                    <button class="dev-btn ${btn.cls}" data-idx="${i}">${btn.label()}</button>
                `).join('')}
            </div>
        </div>
    `;
}

page.addEventListener('click', async (e) => {
    const btn = e.target.closest('.dev-btn');
    if (!btn || btn.disabled) return;
    const idx = Number(btn.dataset.idx);
    const def = buttons[idx];
    if (!def) return;

    btn.disabled = true;
    try {
        await def.action();
    } finally {
        btn.disabled = false;
    }
});

render();
