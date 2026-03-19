/**
 * Cart page — renders cart items with options + in-page checkout form.
 * Checkout includes: delivery zone, address, name, phone, fee calc, armed confirm.
 */

import { getItems, getTotal, getCount, itemTotal, removeItem, setOption, clear } from './cart.js';
import { createOrder, updateOrderFields, getUnavailableItems, saveDeliveryInfo, getDeliveryInfo } from './order-store.js';
import { submitOrder } from './restaurant-api.js';
import { t, localize } from './i18n.js';
import { ToastMessager } from '/javascript/toast.js';

const cartPage = document.getElementById('cart-page');
const cartNavi = document.querySelector('[data-sub-navi-item="cart"]');
const badge = cartNavi?.querySelector('.cart-badge');
const toast = new ToastMessager();

const DELIVERY_ZONES = [
    { id: 'center', name: { 'zh-TW': '屯門市中心', en: 'Tuen Mun Central' }, distanceKm: 1.5, fee: 0 },
    { id: 'north', name: { 'zh-TW': '屯門北', en: 'Tuen Mun North' }, distanceKm: 3.0, fee: 15 },
    { id: 'tsw', name: { 'zh-TW': '天水圍', en: 'Tin Shui Wai' }, distanceKm: 4.5, fee: 25 },
    { id: 'yl', name: { 'zh-TW': '元朗', en: 'Yuen Long' }, distanceKm: 6.0, fee: -1 },
];
const MIN_ORDER = 50;

let armed = false;
let armTimer = null;

function renderBadge() {
    const count = getCount();
    if (badge) {
        badge.textContent = count || '';
        badge.hidden = count === 0;
    }
}

function isActive(sel, ci) {
    return Array.isArray(sel) ? sel.includes(ci) : sel === ci;
}

function resetArmed() {
    if (!armed) return;
    armed = false;
    clearTimeout(armTimer);
    const btn = document.getElementById('place-order-btn');
    if (btn) {
        btn.classList.remove('armed');
        btn.textContent = t('cart.place-order');
    }
}

function renderOptions(item) {
    const unavailable = getUnavailableItems();
    return item.options.map(opt => {
        const sel = item.selected[opt.key];
        const buttons = opt.choices.map((ch, ci) => {
            const isOff = unavailable.includes(ch.label);
            const extraText = ch.extra ? ` +$${ch.extra}` : '';
            return `<button class="option-choice${isActive(sel, ci) ? ' active' : ''}${isOff ? ' choice-unavailable' : ''}" data-item-id="${item.id}" data-key="${opt.key}" data-ci="${ci}" ${isOff ? 'disabled' : ''}>${ch.label}${extraText}</button>`;
        }).join('');
        return `<div class="option-row">
            <span class="option-label">${opt.label}</span>
            <div class="option-choices">${buttons}</div>
        </div>`;
    }).join('');
}

function renderCart() {
    const items = getItems();
    const subtotal = getTotal();

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

    // Partial update: only refresh cart items + totals, preserve checkout form
    const existingList = cartPage.querySelector('.cart-list');
    if (existingList) {
        existingList.innerHTML = rows;
        const totalEl = cartPage.querySelector('.cart-total');
        if (totalEl) totalEl.lastElementChild.textContent = `$${subtotal}`;
        resetArmed();
        validateCheckout();
        renderBadge();
        return;
    }

    const zoneOptions = DELIVERY_ZONES.map(z => {
        const label = localize(z.name);
        const feeText = z.fee === -1 ? `(${t('cart.out-of-range')})` : z.fee === 0 ? `(${t('cart.free')})` : `(+$${z.fee})`;
        return `<option value="${z.id}" ${z.fee === -1 ? 'data-out-of-range' : ''}>${label} ${z.distanceKm}km ${feeText}</option>`;
    }).join('');

    armed = false;
    clearTimeout(armTimer);

    cartPage.innerHTML = `
        <div class="cart-list">${rows}</div>
        <div class="cart-footer">
            <div class="cart-total">
                <span>${t('cart.subtotal')}</span>
                <span>$${subtotal}</span>
            </div>
        </div>
        <div class="checkout-form">
            <div class="checkout-title">${t('cart.delivery-info')}</div>
            <div class="checkout-field">
                <label class="checkout-label">${t('cart.delivery-zone')}</label>
                <select id="delivery-zone" class="checkout-input">
                    <option value="">${t('cart.select-zone')}</option>
                    ${zoneOptions}
                </select>
            </div>
            <div class="checkout-field">
                <label class="checkout-label">${t('cart.delivery-address')}</label>
                <input type="text" id="delivery-address" class="checkout-input" placeholder="${t('cart.address-placeholder')}">
            </div>
            <div class="checkout-field">
                <label class="checkout-label">${t('cart.customer-name')}</label>
                <input type="text" id="customer-name" class="checkout-input" placeholder="${t('cart.name-placeholder')}">
            </div>
            <div class="checkout-field">
                <label class="checkout-label">${t('cart.customer-phone')}</label>
                <input type="tel" id="customer-phone" class="checkout-input" placeholder="${t('cart.phone-placeholder')}">
            </div>
            <div class="checkout-field">
                <label class="checkout-label">${t('cart.email')}</label>
                <input type="email" id="customer-email" class="checkout-input" placeholder="${t('cart.email-placeholder')}">
            </div>
            <div class="checkout-field">
                <label class="checkout-label">${t('cart.comment')}</label>
                <textarea id="order-comment" class="checkout-input checkout-textarea" placeholder="${t('cart.comment-placeholder')}" rows="2"></textarea>
            </div>
            <div id="fee-display" class="checkout-fee" hidden>
                <div class="fee-row">
                    <span>${t('cart.subtotal')}</span>
                    <span id="fee-subtotal">$${subtotal}</span>
                </div>
                <div class="fee-row">
                    <span>${t('cart.delivery-fee')}</span>
                    <span id="fee-delivery">$0</span>
                </div>
                <div class="fee-row fee-total">
                    <span>${t('cart.grand-total')}</span>
                    <span id="fee-total">$${subtotal}</span>
                </div>
            </div>
            <div id="checkout-error" class="checkout-error" hidden></div>
            <button class="checkout-btn" id="place-order-btn" disabled>${t('cart.place-order')}</button>
        </div>
    `;
    restoreDeliveryInfo();
    validateCheckout();
    renderBadge();
}

function getSelectedZone() {
    const sel = document.getElementById('delivery-zone');
    if (!sel || !sel.value) return null;
    return DELIVERY_ZONES.find(z => z.id === sel.value) || null;
}

function validateCheckout() {
    try {
        const zone = getSelectedZone();
        const address = document.getElementById('delivery-address')?.value?.trim() || '';
        const name = document.getElementById('customer-name')?.value?.trim() || '';
        const phone = document.getElementById('customer-phone')?.value?.trim() || '';
        const subtotal = getTotal();
        const btn = document.getElementById('place-order-btn');
        const errEl = document.getElementById('checkout-error');
        const feeDisplay = document.getElementById('fee-display');

        if (!btn) return;

        let error = '';
        let canOrder = true;

        if (!zone) {
            error = t('cart.error-select-zone');
            canOrder = false;
        } else if (zone.fee === -1) {
            error = t('cart.out-of-range');
            canOrder = false;
        } else if (subtotal < MIN_ORDER) {
            error = t('cart.min-order-msg').replace('${amount}', MIN_ORDER).replace('{amount}', MIN_ORDER);
            canOrder = false;
        } else if (!address) {
            error = t('cart.error-address');
            canOrder = false;
        } else if (!name) {
            error = t('cart.error-name');
            canOrder = false;
        } else if (!phone) {
            error = t('cart.error-phone');
            canOrder = false;
        }

        // Update fee display
        if (feeDisplay) {
            if (zone && zone.fee !== -1) {
                feeDisplay.hidden = false;
                const fs = document.getElementById('fee-subtotal');
                const fd = document.getElementById('fee-delivery');
                const ft = document.getElementById('fee-total');
                if (fs) fs.textContent = `$${subtotal}`;
                if (fd) fd.textContent = zone.fee === 0 ? t('cart.free') : `$${zone.fee}`;
                if (ft) ft.textContent = `$${subtotal + zone.fee}`;
            } else if (zone) {
                feeDisplay.hidden = false;
                const fs = document.getElementById('fee-subtotal');
                const fd = document.getElementById('fee-delivery');
                const ft = document.getElementById('fee-total');
                if (fs) fs.textContent = `$${subtotal}`;
                if (fd) fd.textContent = '—';
                if (ft) ft.textContent = '—';
            } else {
                feeDisplay.hidden = true;
            }
        }

        if (errEl) {
            errEl.textContent = error;
            errEl.hidden = !error;
        }
        btn.disabled = !canOrder;
    } catch (e) {
        console.error('validateCheckout error:', e);
    }
}

function persistDeliveryInfo() {
    saveDeliveryInfo({
        zone: document.getElementById('delivery-zone')?.value || '',
        address: document.getElementById('delivery-address')?.value || '',
        name: document.getElementById('customer-name')?.value || '',
        phone: document.getElementById('customer-phone')?.value || '',
        email: document.getElementById('customer-email')?.value || '',
        comment: document.getElementById('order-comment')?.value || '',
    });
}

function restoreDeliveryInfo() {
    const info = getDeliveryInfo();
    if (!info || !Object.keys(info).length) return;
    const zone = document.getElementById('delivery-zone');
    const address = document.getElementById('delivery-address');
    const name = document.getElementById('customer-name');
    const phone = document.getElementById('customer-phone');
    const email = document.getElementById('customer-email');
    const comment = document.getElementById('order-comment');
    if (zone && info.zone) zone.value = info.zone;
    if (address && info.address) address.value = info.address;
    if (name && info.name) name.value = info.name;
    if (phone && info.phone) phone.value = info.phone;
    if (email && info.email) email.value = info.email;
    if (comment && info.comment) comment.value = info.comment;
}

cartPage.addEventListener('input', (e) => {
    if (e.target.closest('.checkout-form')) {
        persistDeliveryInfo();
        validateCheckout();
    }
});

cartPage.addEventListener('change', (e) => {
    if (e.target.id === 'delivery-zone') {
        persistDeliveryInfo();
        validateCheckout();
    }
});

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

    const orderBtn = e.target.closest('#place-order-btn');
    if (orderBtn) {
        handlePlaceOrder(orderBtn);
        return;
    }
});

async function handlePlaceOrder(btn) {
    if (btn.disabled) return;

    if (!armed) {
        armed = true;
        btn.classList.add('armed');
        const zone = getSelectedZone();
        const total = getTotal() + (zone?.fee || 0);
        btn.textContent = `${t('cart.confirm-order')} $${total}`;
        armTimer = setTimeout(() => {
            armed = false;
            btn.classList.remove('armed');
            btn.textContent = t('cart.place-order');
        }, 3000);
        return;
    }

    armed = false;
    clearTimeout(armTimer);
    btn.disabled = true;
    btn.textContent = '...';

    try {
        const zone = getSelectedZone();
        const items = getItems().map(item => {
            const options = {};
            for (const opt of item.options) {
                const sel = item.selected[opt.key];
                if (sel == null) continue;
                if (Array.isArray(sel)) {
                    const labels = sel.map(ci => opt.choices[ci]?.label).filter(Boolean);
                    if (labels.length) options[opt.key] = labels;
                } else {
                    options[opt.key] = opt.choices[sel]?.label ?? null;
                }
            }
            return { name: item.name, subtotal: itemTotal(item), options };
        });

        const deliveryAddress = document.getElementById('delivery-address').value.trim();
        const customerName = document.getElementById('customer-name').value.trim();
        const customerPhone = document.getElementById('customer-phone').value.trim();
        const customerEmail = document.getElementById('customer-email')?.value.trim() || '';
        const orderComment = document.getElementById('order-comment')?.value.trim() || '';
        const subtotal = getTotal();

        // Save to IndexedDB (local history)
        const order = await createOrder({
            items,
            deliveryZone: localize(zone.name),
            deliveryAddress,
            deliveryFee: zone.fee,
            distanceKm: zone.distanceKm,
            customerName,
            customerPhone,
            comment: orderComment,
            subtotal,
        });

        // Submit to API (kitchen sees it via PostgreSQL)
        try {
            const apiOrder = await submitOrder({
                items: items.map(i => ({ name: i.name, subtotal: i.subtotal, options: i.options })),
                delivery_zone: localize(zone.name),
                delivery_address: deliveryAddress,
                delivery_fee: zone.fee,
                distance_km: zone.distanceKm,
                customer_name: customerName,
                customer_phone: customerPhone,
                customer_email: customerEmail || undefined,
                comment: orderComment,
            });
            // Save API order number to local record for status polling
            await updateOrderFields(order.id, { apiOrderNumber: apiOrder.order_number });
            toast.addMessage(`${t('order.number')}${apiOrder.order_number}`, 4000, 'success');
        } catch {
            toast.addMessage(`${t('order.number')}${order.orderNumber}`, 4000, 'success');
        }

        await clear();
        document.querySelector('[data-sub-navi-item="history"]')?.click();
    } catch (err) {
        toast.addMessage(err.message, 4000, 'error');
        btn.disabled = false;
        btn.classList.remove('armed');
        btn.textContent = t('cart.place-order');
    }
}

window.addEventListener('cart:updated', (e) => {
    renderCart();
    if (e.detail?.action === 'add' && cartNavi) {
        cartNavi.classList.remove('cart-shake');
        void cartNavi.offsetWidth;
        cartNavi.classList.add('cart-shake');
    }
});
renderCart();
