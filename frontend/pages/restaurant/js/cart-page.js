/**
 * Cart page — renders cart instances with single-choice options.
 */

import { getItems, getTotal, getCount, itemTotal, removeItem, setOption } from './cart.js';
import { t } from './i18n.js';

const cartPage = document.getElementById('cart-page');
const cartNavi = document.querySelector('[data-sub-navi-item="cart"]');
const badge = cartNavi?.querySelector('.cart-badge');

function renderBadge() {
    const count = getCount();
    if (badge) {
        badge.textContent = count || '';
        badge.hidden = count === 0;
    }
}

function renderOptions(item) {
    return item.options.map(opt => {
        const buttons = opt.choices.map((ch, ci) => {
            const active = item.selected[opt.key] === ci;
            const extraText = ch.extra ? ` +$${ch.extra}` : '';
            return `<button class="option-choice${active ? ' active' : ''}" data-item-id="${item.id}" data-key="${opt.key}" data-ci="${ci}">${ch.label}${extraText}</button>`;
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
});

window.addEventListener('cart:updated', (e) => {
    renderCart();
    if (e.detail?.action === 'add' && cartNavi) {
        cartNavi.classList.remove('cart-shake');
        void cartNavi.offsetWidth; // reflow to restart animation
        cartNavi.classList.add('cart-shake');
    }
});
renderCart();
