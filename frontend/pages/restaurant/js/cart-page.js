/**
 * Cart page — renders cart items, qty controls, total.
 */

import { getItems, getTotal, getCount, updateQty, removeItem, clear } from './cart.js';
import { t } from './i18n.js';

const cartPage = document.getElementById('cart-page');
const badge = document.querySelector('[data-sub-navi-item="cart"] .cart-badge');

function renderBadge() {
    const count = getCount();
    if (badge) {
        badge.textContent = count || '';
        badge.hidden = count === 0;
    }
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
        <div class="cart-row" data-name="${item.name}">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">$${item.price}</div>
            </div>
            <div class="cart-item-controls">
                <button class="cart-qty-btn" data-delta="-1">&minus;</button>
                <span class="cart-qty">${item.qty}</span>
                <button class="cart-qty-btn" data-delta="1">+</button>
            </div>
            <div class="cart-item-subtotal">$${item.price * item.qty}</div>
        </div>
    `).join('');

    cartPage.innerHTML = `
        <div class="cart-list">${rows}</div>
        <div class="cart-footer">
            <div class="cart-total">
                <span>${t('cart.total')}</span>
                <span>$${total}</span>
            </div>
        </div>
    `;
    renderBadge();
}

// Event delegation for qty buttons
cartPage.addEventListener('click', (e) => {
    const qtyBtn = e.target.closest('.cart-qty-btn');
    if (qtyBtn) {
        const row = qtyBtn.closest('.cart-row');
        const delta = Number(qtyBtn.dataset.delta);
        updateQty(row.dataset.name, delta);
        return;
    }
});

window.addEventListener('cart:updated', renderCart);

// Initial render
renderCart();
