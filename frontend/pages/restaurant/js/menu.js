/**
 * Menu page — delegates click on food cards to add-to-cart.
 */

import { addItem } from './cart.js';

const menuPage = document.getElementById('menu-page');

menuPage.addEventListener('click', (e) => {
    const btn = e.target.closest('.food-item-add');
    if (!btn) return;

    e.stopPropagation();
    const card = btn.closest('.food-item-container');
    const name = card.dataset.name;
    const price = Number(card.dataset.price);
    const options = JSON.parse(card.dataset.options || '[]');
    addItem(name, price, options);
});
