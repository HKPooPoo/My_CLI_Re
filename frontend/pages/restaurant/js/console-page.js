/**
 * Console page — dev testing buttons + branch/session/kitchen management.
 */

import { t } from './i18n.js';
import { addItem, clear as clearCart, getCount } from './cart.js';
import db from './db.js';
import { render as renderReceipt } from './receipt-page.js';
import { submitOrder } from './order-api.js';
import { saveOrder } from './receipt-page.js';
import { ToastMessager } from '/javascript/toast.js';
import { itemTotal } from './cart.js';
import { getSession, setSession, clearSession } from './session.js';

const page = document.getElementById('dev-tools-page');
const toast = new ToastMessager();

// ── Existing dev buttons ──

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

// ── Fetch branches from API ──

let branches = [];

async function loadBranches() {
    try {
        const res = await fetch('/api/restaurant/branches', {
            headers: { 'Accept': 'application/json' },
        });
        if (res.ok) branches = await res.json();
    } catch { /* ignore */ }
}

// ── Render ──

function render() {
    const session = getSession();
    const kitchenBranch = localStorage.getItem('kitchen-branch') || '';
    const branchOptions = branches.map(b =>
        `<option value="${b.code}" ${b.code === kitchenBranch ? 'selected' : ''}>${b.name} (${b.code})</option>`
    ).join('');
    const checkInBranchOptions = branches.map(b =>
        `<option value="${b.code}">${b.name} (${b.code})</option>`
    ).join('');

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
            <div class="console-title">${t('console.session-title')}</div>
            <div class="console-section">
                ${session ? `
                    <div class="console-info">
                        <span class="console-info-label">${t('console.current-session')}</span>
                        <span class="console-info-value">${session.branch_name} · Table ${session.table_number}</span>
                    </div>
                    <button class="dev-btn dev-btn-warn" data-action="checkout">${t('console.checkout')}</button>
                ` : `
                    <div class="console-field-row">
                        <select id="checkin-branch" class="console-select">${checkInBranchOptions}</select>
                        <input id="checkin-table" type="number" min="1" value="1" class="console-input" placeholder="Table #">
                    </div>
                    <button class="dev-btn" data-action="checkin">${t('console.checkin')}</button>
                `}
            </div>
        </div>

        <div class="console-container">
            <div class="console-title">${t('console.kitchen-title')}</div>
            <div class="console-section">
                <div class="console-field-row">
                    <select id="kitchen-branch-select" class="console-select">
                        <option value="">${t('console.no-branch')}</option>
                        ${branchOptions}
                    </select>
                </div>
                <button class="dev-btn" data-action="bind-kitchen">${t('console.bind-kitchen')}</button>
                ${kitchenBranch ? `<button class="dev-btn dev-btn-warn" data-action="unbind-kitchen">${t('console.unbind-kitchen')}</button>` : ''}
            </div>
        </div>

        <div class="console-container">
            <div class="console-title">${t('console.branch-title')}</div>
            <div class="console-section">
                <div class="console-field-row">
                    <input id="new-branch-code" type="text" class="console-input" placeholder="${t('console.branch-code')}">
                    <input id="new-branch-name" type="text" class="console-input" placeholder="${t('console.branch-name')}">
                </div>
                <button class="dev-btn" data-action="create-branch">${t('console.create-branch')}</button>
                <div class="console-branch-list">
                    ${branches.map(b => `<div class="console-branch-item">${b.code} — ${b.name}</div>`).join('')}
                </div>
            </div>
        </div>
    `;
}

// ── Event handling ──

page.addEventListener('click', async (e) => {
    // Dev buttons (indexed)
    const devBtn = e.target.closest('.dev-btn[data-idx]');
    if (devBtn && !devBtn.disabled) {
        const idx = Number(devBtn.dataset.idx);
        const def = devButtons[idx];
        if (!def) return;
        devBtn.disabled = true;
        try { await def.action(); } finally { devBtn.disabled = false; }
        return;
    }

    // Action buttons
    const actionBtn = e.target.closest('.dev-btn[data-action]');
    if (!actionBtn || actionBtn.disabled) return;
    const action = actionBtn.dataset.action;
    actionBtn.disabled = true;

    try {
        switch (action) {
            case 'checkin': {
                const code = document.getElementById('checkin-branch')?.value;
                const table = Number(document.getElementById('checkin-table')?.value);
                if (!code || !table) { toast.addMessage('Select branch and table', 2000, 'error'); break; }
                const res = await fetch('/api/restaurant/sessions/check-in', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ branch_code: code, table_number: table }),
                });
                if (!res.ok) { toast.addMessage('Check-in failed', 2000, 'error'); break; }
                const data = await res.json();
                setSession(data);
                toast.addMessage(`${t('console.checked-in')} ${data.branch_name} · Table ${data.table_number}`, 3000, 'success');
                render();
                break;
            }
            case 'checkout': {
                const session = getSession();
                if (session?.token) {
                    await fetch('/api/restaurant/sessions/check-out', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({ token: session.token }),
                    });
                }
                clearSession();
                toast.addMessage(t('console.checked-out'), 2000, 'info');
                render();
                break;
            }
            case 'bind-kitchen': {
                const code = document.getElementById('kitchen-branch-select')?.value;
                if (code) {
                    localStorage.setItem('kitchen-branch', code);
                    toast.addMessage(`${t('console.kitchen-bound')} ${code}`, 2000, 'success');
                } else {
                    localStorage.removeItem('kitchen-branch');
                    toast.addMessage(t('console.kitchen-unbound'), 2000, 'info');
                }
                window.dispatchEvent(new CustomEvent('kitchen:branchChanged'));
                render();
                break;
            }
            case 'unbind-kitchen': {
                localStorage.removeItem('kitchen-branch');
                toast.addMessage(t('console.kitchen-unbound'), 2000, 'info');
                window.dispatchEvent(new CustomEvent('kitchen:branchChanged'));
                render();
                break;
            }
            case 'create-branch': {
                const code = document.getElementById('new-branch-code')?.value?.trim();
                const name = document.getElementById('new-branch-name')?.value?.trim();
                if (!code || !name) { toast.addMessage('Code and name required', 2000, 'error'); break; }
                const res = await fetch('/api/restaurant/branches', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ code, name }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    toast.addMessage(err.message || 'Failed', 3000, 'error');
                    break;
                }
                await loadBranches();
                toast.addMessage(`${t('console.branch-created')} ${code}`, 2000, 'success');
                render();
                break;
            }
        }
    } finally {
        actionBtn.disabled = false;
    }
});

// ── Init ──
await loadBranches();
render();
