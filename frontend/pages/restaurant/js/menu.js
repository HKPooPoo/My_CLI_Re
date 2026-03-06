/**
 * Menu page — delegates click on food cards to add-to-cart.
 */

import { addItem } from './cart.js';
import { t } from './i18n.js';

const menuPage = document.getElementById('menu-page');

menuPage.addEventListener('click', (e) => {
    const btn = e.target.closest('.food-item-add');
    if (!btn) return;

    e.stopPropagation();
    const card = btn.closest('.food-item-container');
    const name = card.dataset.name;
    const price = Number(card.dataset.price);
    addItem(name, price);

    // brief visual feedback on the button
    btn.classList.add('added');
    setTimeout(() => btn.classList.remove('added'), 300);
});
