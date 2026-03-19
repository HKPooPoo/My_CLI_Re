/**
 * Menu page — click to add items to cart.
 * Timeslot filtering: morning (<11:00) vs regular (≥11:00).
 * Items without data-timeslot are always visible (all-day).
 * Search bar filters items by name.
 */

import { addItem } from './cart.js';
import { getUnavailableItems } from './order-store.js';
import { t } from './i18n.js';

const menuPage = document.getElementById('menu-page');
if (!menuPage) console.warn('menu.js: #menu-page not found');

const MORNING_CUTOFF = 11; // Before 11:00 = morning

function getCurrentSlot() {
    return new Date().getHours() < MORNING_CUTOFF ? 'morning' : 'regular';
}

/* ── Timeslot filtering ── */

function updateTimeslot() {
    if (!menuPage) return;
    const slot = getCurrentSlot();

    // Update banner
    const banner = document.getElementById('timeslot-banner');
    if (banner) {
        const isMorning = slot === 'morning';
        banner.textContent = isMorning ? t('menu.slot-morning') : t('menu.slot-regular');
        banner.className = `timeslot-banner ${isMorning ? 'slot-morning' : 'slot-regular'}`;
    }

    // Show/hide categories and items based on timeslot
    menuPage.querySelectorAll('[data-timeslot]').forEach(el => {
        const itemSlot = el.dataset.timeslot;
        // No timeslot = always visible; matching slot = visible; else hidden
        const visible = !itemSlot || itemSlot === slot;
        el.classList.toggle('timeslot-hidden', !visible);
    });
}

/* ── Availability (kitchen toggle) ── */

function updateAvailability() {
    if (!menuPage) return;
    const unavailable = getUnavailableItems();
    menuPage.querySelectorAll('.food-item-container').forEach(card => {
        const name = card.dataset.name;
        const isOff = unavailable.includes(name);
        card.classList.toggle('item-unavailable', isOff);
        const btn = card.querySelector('.food-item-add');
        if (btn) btn.disabled = isOff;
    });
}

/* ── Add to cart ── */

if (menuPage) {
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
}

/* ── Search ── */

const searchInput = menuPage?.querySelector('#menu-search');
if (searchInput) {
    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        menuPage.querySelectorAll('.food-categorized-container').forEach(cat => {
            // Skip timeslot-hidden categories
            if (cat.classList.contains('timeslot-hidden')) return;
            let anyVisible = false;
            cat.querySelectorAll('.food-item-container').forEach(card => {
                if (card.classList.contains('timeslot-hidden')) {
                    card.classList.add('search-hidden');
                    return;
                }
                const match = !q || card.dataset.name.toLowerCase().includes(q);
                card.classList.toggle('search-hidden', !match);
                if (match) anyVisible = true;
            });
            cat.classList.toggle('search-hidden', !anyVisible);
        });
    });
}

/* ── Init + events ── */

window.addEventListener('menu:availabilityChanged', updateAvailability);
window.addEventListener('storage', (e) => {
    if (e.key === 'menu-unavailable') updateAvailability();
});

updateTimeslot();
updateAvailability();

// Re-check timeslot every minute (in case user keeps page open across 11:00)
setInterval(updateTimeslot, 60000);
