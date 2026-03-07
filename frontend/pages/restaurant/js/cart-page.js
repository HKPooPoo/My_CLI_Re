/**
 * Cart page — renders cart instances with single-choice options.
 */

import { getItems, getTotal, getCount, itemTotal, removeItem, setOption, clear } from './cart.js';
import { t } from './i18n.js';
import { submitOrder } from './order-api.js';
import { saveOrder } from './receipt-page.js';
import { ToastMessager } from '/javascript/toast.js';

const cartPage = document.getElementById('cart-page');
const cartNavi = document.querySelector('[data-sub-navi-item="cart"]');
const badge = cartNavi?.querySelector('.cart-badge');
const toast = new ToastMessager();

let armed = false;
let armTimer = null;

function renderBadge() {
    const count = getCount();
    if (badge) {
        badge.textContent = count || '';
        badge.hidden = count === 0;
    }
}

function isActive(sel, ci) {
    return Array.isArray(sel) ? sel.includes(ci) : sel === ci;
}

function renderOptions(item) {
    return item.options.map(opt => {
        const sel = item.selected[opt.key];
        const buttons = opt.choices.map((ch, ci) => {
            const extraText = ch.extra ? ` +$${ch.extra}` : '';
            return `<button class="option-choice${isActive(sel, ci) ? ' active' : ''}" data-item-id="${item.id}" data-key="${opt.key}" data-ci="${ci}">${ch.label}${extraText}</button>`;
        }).join('');
        return `<div class="option-row">
            <span class="option-label">${opt.label}</span>
            <div class="option-choices">${buttons}</div>
        </div>`;
    }).join('');
}

function renderCart() {
    const items = getItems();
    const total = getTotal();

    if (items.length === 0) {
        cartPage.innerHTML = `<div class="cart-empty">${t('cart.empty')}</div>`;
        renderBadge();
        return;
    }

    const rows = items.map(item => `
        <div class="cart-row" data-id="${item.id}">
            <div class="cart-row-header">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-total">$${itemTotal(item)}</div>
            </div>
            ${renderOptions(item)}
            <div class="cart-row-footer">
                <button class="cart-remove" data-id="${item.id}">${t('cart.remove')}</button>
            </div>
        </div>
    `).join('');

    armed = false;
    clearTimeout(armTimer);

    cartPage.innerHTML = `
        <div class="cart-list">${rows}</div>
        <div class="cart-footer">
            <div class="cart-total">
                <span>${t('cart.total')}</span>
                <span>$${total}</span>
            </div>
            <button class="checkout-btn">${t('cart.checkout')}</button>
        </div>
    `;
    renderBadge();
}

cartPage.addEventListener('click', (e) => {
    const choiceBtn = e.target.closest('.option-choice');
    if (choiceBtn) {
        setOption(
            Number(choiceBtn.dataset.itemId),
            choiceBtn.dataset.key,
            Number(choiceBtn.dataset.ci)
        );
        return;
    }

    const removeBtn = e.target.closest('.cart-remove');
    if (removeBtn) {
        removeItem(Number(removeBtn.dataset.id));
        return;
    }

    const checkoutBtn = e.target.closest('.checkout-btn');
    if (checkoutBtn) {
        handleCheckout(checkoutBtn);
        return;
    }
});

async function handleCheckout(btn) {
    if (btn.disabled) return;

    if (!armed) {
        armed = true;
        btn.classList.add('armed');
        btn.textContent = `${t('cart.confirm_checkout')} $${getTotal()}`;
        armTimer = setTimeout(() => {
            armed = false;
            btn.classList.remove('armed');
            btn.textContent = t('cart.checkout');
        }, 3000);
        return;
    }

    armed = false;
    clearTimeout(armTimer);
    btn.disabled = true;
    btn.textContent = '...';

    try {
        const result = await submitOrder(getItems());
        saveOrder({
            order_number: result.order_number,
            total: result.total,
            status: result.status,
            time: new Date().toISOString(),
            items: getItems().map(item => {
                const options = {};
                for (const opt of item.options) {
                    const sel = item.selected[opt.key];
                    if (sel == null) continue;
                    if (Array.isArray(sel)) {
                        const labels = sel.map(ci => opt.choices[ci]?.label).filter(Boolean);
                        if (labels.length) options[opt.key] = labels;
                    } else {
                        options[opt.key] = opt.choices[sel]?.label ?? null;
                    }
                }
                return { name: item.name, subtotal: itemTotal(item), options };
            }),
        });
        clear();
        toast.addMessage(`${t('order.number')}${result.order_number}`, 4000, 'success');
        document.querySelector('[data-sub-navi-item="recipt"]')?.click();
    } catch (err) {
        toast.addMessage(err.message, 4000, 'error');
        btn.disabled = false;
        btn.classList.remove('armed');
        btn.textContent = t('cart.checkout');
    }
}

window.addEventListener('cart:updated', (e) => {
    renderCart();
    if (e.detail?.action === 'add' && cartNavi) {
        cartNavi.classList.remove('cart-shake');
        void cartNavi.offsetWidth; // reflow to restart animation
        cartNavi.classList.add('cart-shake');
    }
});
renderCart();
