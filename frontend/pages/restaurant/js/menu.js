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

// ── Search ──

const searchInput = document.getElementById('menu-search');
if (searchInput) {
    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        menuPage.querySelectorAll('.food-categorized-container').forEach(cat => {
            let anyVisible = false;
            cat.querySelectorAll('.food-item-container').forEach(card => {
                const match = !q || card.dataset.name.toLowerCase().includes(q);
                card.style.display = match ? '' : 'none';
                if (match) anyVisible = true;
            });
            cat.style.display = anyVisible ? '' : 'none';
        });
    });
}

window.addEventListener('menu:availabilityChanged', updateAvailability);
updateAvailability();
