/**
 * Kitchen menu control — toggle item availability.
 * Reads items from the menu page DOM, manages availability via localStorage.
 */

import { t } from './i18n.js';
import { getUnavailableItems, toggleAvailability } from './order-store.js';

const page = document.getElementById('kitchen-menu-page');

function getMenuItems() {
    const items = [];
    document.querySelectorAll('#menu-page .food-item-container').forEach(card => {
        items.push({
            name: card.dataset.name,
            price: Number(card.dataset.price),
        });
    });
    return items;
}

function render() {
    const items = getMenuItems();
    const unavailable = getUnavailableItems();

    if (!items.length) {
        page.innerHTML = `<div class="cart-empty">${t('kitchen.no-items')}</div>`;
        return;
    }

    page.innerHTML = `
        <div class="kitchen-menu-list">
            <div class="kitchen-section-title">${t('kitchen.menu-title')}</div>
            ${items.map(item => {
                const isOff = unavailable.includes(item.name);
                return `
                <div class="kitchen-menu-item ${isOff ? 'item-off' : ''}">
                    <div class="kitchen-menu-item-info">
                        <span class="kitchen-menu-item-name">${item.name}</span>
                        <span class="kitchen-menu-item-price">$${item.price}</span>
                    </div>
                    <button class="kitchen-toggle-btn ${isOff ? 'toggle-off' : 'toggle-on'}" data-name="${item.name}">
                        ${isOff ? t('kitchen.unavailable') : t('kitchen.available')}
                    </button>
                </div>`;
            }).join('')}
        </div>
    `;
}

page.addEventListener('click', (e) => {
    const btn = e.target.closest('.kitchen-toggle-btn');
    if (!btn) return;
    toggleAvailability(btn.dataset.name);
    render();
});

window.addEventListener('menu:availabilityChanged', render);
render();
