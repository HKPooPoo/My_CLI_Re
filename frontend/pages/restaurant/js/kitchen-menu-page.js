/**
 * Kitchen menu control — toggle item availability.
 * Uses hardcoded item list (kitchen is a separate page, can't scrape menu DOM).
 */

import { t } from './i18n.js';
import { getUnavailableItems, toggleAvailability } from './order-store.js';

const page = document.getElementById('kitchen-menu-page');
if (!page) console.warn('kitchen-menu-page.js: #kitchen-menu-page not found');

const MENU_ITEMS = [
    { name: '滷肉飯', price: 42 },
    { name: '炒飯', price: 40 },
    { name: '肥牛炒烏冬', price: 48 },
    { name: '肉醬意粉', price: 45 },
    { name: '茉香綠茶', price: 18 },
    { name: '金桔綠茶', price: 18 },
    { name: '青蘋菓綠茶', price: 18 },
    { name: '荔枝綠茶', price: 18 },
    { name: '檸檬可樂', price: 20 },
    { name: '鴛鴦', price: 20 },
];

function getMenuItems() {
    return MENU_ITEMS;
}

function render() {
    if (!page) return;
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

page?.addEventListener('click', (e) => {
    const btn = e.target.closest('.kitchen-toggle-btn');
    if (!btn) return;
    toggleAvailability(btn.dataset.name);
    render();
});

window.addEventListener('menu:availabilityChanged', render);
render();
