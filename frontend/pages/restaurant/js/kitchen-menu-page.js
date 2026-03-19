/**
 * Kitchen menu control — toggle item availability.
 * Shows timeslot badge per item. All items visible regardless of time.
 */

import { t } from './i18n.js';
import { getUnavailableItems, toggleAvailability } from './order-store.js';

const page = document.getElementById('kitchen-menu-page');
if (!page) console.warn('kitchen-menu-page.js: #kitchen-menu-page not found');

const MENU_ITEMS = [
    { name: '雪菜肉絲米粉', price: 38, timeslot: 'morning' },
    { name: '滷肉飯', price: 52, timeslot: 'regular' },
    { name: '炒飯', price: 50, timeslot: 'regular' },
    { name: '肥牛炒烏冬', price: 55, timeslot: 'regular' },
    { name: '肉醬意粉', price: 52, timeslot: 'regular' },
    { name: '茉香綠茶', price: 18 },
    { name: '金桔綠茶', price: 18 },
    { name: '青蘋菓綠茶', price: 18 },
    { name: '荔枝綠茶', price: 18 },
    { name: '檸檬可樂', price: 20 },
    { name: '鴛鴦', price: 20 },
];

const SLOT_BADGE = {
    morning: { label: () => t('menu.slot-morning'), cls: 'slot-badge-morning' },
    regular: { label: () => t('menu.slot-regular'), cls: 'slot-badge-regular' },
};

function render() {
    if (!page) return;
    const items = MENU_ITEMS;
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
                const badge = item.timeslot && SLOT_BADGE[item.timeslot]
                    ? `<span class="slot-badge ${SLOT_BADGE[item.timeslot].cls}">${SLOT_BADGE[item.timeslot].label()}</span>`
                    : `<span class="slot-badge slot-badge-all">${t('menu.slot-all')}</span>`;
                return `
                <div class="kitchen-menu-item ${isOff ? 'item-off' : ''}">
                    <div class="kitchen-menu-item-info">
                        <span class="kitchen-menu-item-name">${item.name} ${badge}</span>
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
