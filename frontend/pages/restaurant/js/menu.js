/**
 * Menu page — click to add items to cart.
 * Checks localStorage for unavailable items and greys them out.
 */

import { addItem } from './cart.js';
import { getUnavailableItems } from './order-store.js';

const menuPage = document.getElementById('menu-page');

function updateAvailability() {
    const unavailable = getUnavailableItems();
    menuPage.querySelectorAll('.food-item-container').forEach(card => {
        const name = card.dataset.name;
        const isOff = unavailable.includes(name);
        card.classList.toggle('item-unavailable', isOff);
        const btn = card.querySelector('.food-item-add');
        if (btn) btn.disabled = isOff;
    });
}

menuPage.addEventListener('click', (e) => {
    const btn = e.target.closest('.food-item-add');
    if (!btn || btn.disabled) return;

    e.stopPropagation();
    const card = btn.closest('.food-item-container');
    const name = card.dataset.name;
    const price = Number(card.dataset.price);
    const options = JSON.parse(card.dataset.options || '[]');
    addItem(name, price, options);
});

window.addEventListener('menu:availabilityChanged', updateAvailability);
// Cross-tab: kitchen toggles availability in another tab
window.addEventListener('storage', (e) => {
    if (e.key === 'menu-unavailable') updateAvailability();
});
updateAvailability();
