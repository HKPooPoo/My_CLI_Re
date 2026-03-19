/**
 * Cart page — renders cart items with options + in-page checkout form.
 * Checkout includes: address verification (Google Maps Distance Matrix API), fee calc,
 * Stripe Checkout payment, armed confirm.
 *
 * Delivery fee tiers (by ceiling km):
 *   ≤1km  → $0
 *   ≤2km  → $10
 *   ≤3km  → $20
 *   ≤4km  → $30
 *   ≥5km  → unavailable
 */

import { getItems, getTotal, getCount, itemTotal, removeItem, setOption, clear } from './cart.js';
import { createOrder, updateOrderFields, getUnavailableItems, saveDeliveryInfo, getDeliveryInfo } from './order-store.js';
import { submitOrder, calculateDistance, createCheckoutSession } from './restaurant-api.js';
import { t, localize } from './i18n.js';
import { ToastMessager } from '/javascript/toast.js';

const cartPage = document.getElementById('cart-page');
const cartNavi = document.querySelector('[data-sub-navi-item="cart"]');
const badge = cartNavi?.querySelector('.cart-badge');
const toast = new ToastMessager();

import { BRANCH } from './branch.js';

const MIN_ORDER = 50;
const MAX_DISTANCE_KM = 5;

let armed = false;
let armTimer = null;

// Verification state: null = not verified, false = out of range, { distanceKm, fee } = verified
let verified = null;
let lastVerifiedAddress = '';

/* ══════════════════════════════════════
   Google Maps Distance Matrix API
   Calls backend proxy → Google API (key stays server-side).
   ══════════════════════════════════════ */

// Restaurant fixed origin per branch (extend for new branches)
const BRANCH_ORIGINS = {
    TM01: 'Tuen Mun, Hong Kong',
    TSW01: 'Tin Shui Wai, Hong Kong',
};
const DEFAULT_ORIGIN = 'Tuen Mun, Hong Kong';

function calculateFee(distanceKm) {
    const ceil = Math.ceil(distanceKm);
    if (ceil <= 1) return 0;
    return (ceil - 1) * 10;
}

async function getDistance(address) {
    const origin = BRANCH_ORIGINS[BRANCH] || DEFAULT_ORIGIN;
    const data = await calculateDistance(origin, address);
    return data.distance_km;
}

/* ══════════════════════════════════════
   Render helpers
   ══════════════════════════════════════ */

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

/* ══════════════════════════════════════
   Verification result display
   ══════════════════════════════════════ */

function renderVerifyResult() {
    const resultEl = document.getElementById('verify-result');
    if (!resultEl) return;

    if (verified === null) {
        resultEl.innerHTML = '';
        resultEl.hidden = true;
        return;
    }

    if (verified === false) {
        resultEl.innerHTML = `<span class="verify-fail">${t('cart.out-of-range')} (≥${MAX_DISTANCE_KM}km)</span>`;
        resultEl.hidden = false;
        return;
    }

    resultEl.innerHTML = `
        <span class="verify-pass">${t('cart.verified')}</span>
        <span class="verify-distance">${verified.distanceKm.toFixed(1)}km</span>
        <span class="verify-fee">${t('cart.delivery-fee')}: ${verified.fee === 0 ? t('cart.free') : '$' + verified.fee}</span>
    `;
    resultEl.hidden = false;
}

/* ══════════════════════════════════════
   Main render
   ══════════════════════════════════════ */

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
                <label class="checkout-label">${t('cart.delivery-address')}</label>
                <div class="address-verify-row">
                    <input type="text" id="delivery-address" class="checkout-input" placeholder="${t('cart.address-placeholder')}">
                    <button class="verify-btn" id="verify-btn">${t('cart.verify-btn')}</button>
                </div>
                <div id="verify-result" class="verify-result" hidden></div>
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
    renderVerifyResult();
    validateCheckout();
    renderBadge();
}

/* ══════════════════════════════════════
   Address verification
   ══════════════════════════════════════ */

async function verifyAddress() {
    const address = document.getElementById('delivery-address')?.value?.trim();
    const verifyBtn = document.getElementById('verify-btn');
    if (!address || !verifyBtn) return;

    verifyBtn.disabled = true;
    verifyBtn.textContent = t('cart.verifying');

    try {
        const distanceKm = await getDistance(address);

        if (distanceKm >= MAX_DISTANCE_KM) {
            verified = false;
        } else {
            const fee = calculateFee(distanceKm);
            verified = { distanceKm, fee };
        }
        lastVerifiedAddress = address;
    } catch {
        verified = null;
        toast.addMessage('Verification failed', 2000, 'error');
    }

    verifyBtn.disabled = false;
    verifyBtn.textContent = verified && verified !== false
        ? t('cart.verified')
        : t('cart.verify-btn');
    if (verified && verified !== false) {
        verifyBtn.classList.add('verify-passed');
    } else {
        verifyBtn.classList.remove('verify-passed');
    }

    renderVerifyResult();
    validateCheckout();
    persistDeliveryInfo();
}

/* ══════════════════════════════════════
   Validation
   ══════════════════════════════════════ */

function validateCheckout() {
    try {
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

        if (!address) {
            error = t('cart.error-address');
            canOrder = false;
        } else if (verified === null) {
            error = t('cart.verify-first');
            canOrder = false;
        } else if (verified === false) {
            error = t('cart.out-of-range');
            canOrder = false;
        } else if (subtotal < MIN_ORDER) {
            error = t('cart.min-order-msg').replace('${amount}', MIN_ORDER).replace('{amount}', MIN_ORDER);
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
            if (verified && verified !== false) {
                feeDisplay.hidden = false;
                const fs = document.getElementById('fee-subtotal');
                const fd = document.getElementById('fee-delivery');
                const ft = document.getElementById('fee-total');
                if (fs) fs.textContent = `$${subtotal}`;
                if (fd) fd.textContent = verified.fee === 0 ? t('cart.free') : `$${verified.fee}`;
                if (ft) ft.textContent = `$${subtotal + verified.fee}`;
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

/* ══════════════════════════════════════
   Persistence
   ══════════════════════════════════════ */

function persistDeliveryInfo() {
    saveDeliveryInfo({
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
    const address = document.getElementById('delivery-address');
    const name = document.getElementById('customer-name');
    const phone = document.getElementById('customer-phone');
    const email = document.getElementById('customer-email');
    const comment = document.getElementById('order-comment');
    if (address && info.address) address.value = info.address;
    if (name && info.name) name.value = info.name;
    if (phone && info.phone) phone.value = info.phone;
    if (email && info.email) email.value = info.email;
    if (comment && info.comment) comment.value = info.comment;
}

/* ══════════════════════════════════════
   Event handling
   ══════════════════════════════════════ */

cartPage.addEventListener('input', (e) => {
    // Reset verification when address changes
    if (e.target.id === 'delivery-address') {
        const currentAddr = e.target.value.trim();
        if (currentAddr !== lastVerifiedAddress) {
            verified = null;
            const verifyBtn = document.getElementById('verify-btn');
            if (verifyBtn) {
                verifyBtn.textContent = t('cart.verify-btn');
                verifyBtn.classList.remove('verify-passed');
            }
            renderVerifyResult();
        }
    }
    if (e.target.closest('.checkout-form')) {
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

    // Verify address button
    if (e.target.closest('#verify-btn')) {
        verifyAddress();
        return;
    }

    const orderBtn = e.target.closest('#place-order-btn');
    if (orderBtn) {
        handlePlaceOrder(orderBtn);
        return;
    }
});

/* ══════════════════════════════════════
   Place order
   ══════════════════════════════════════ */

async function handlePlaceOrder(btn) {
    if (btn.disabled || !verified || verified === false) return;

    if (!armed) {
        armed = true;
        btn.classList.add('armed');
        const total = getTotal() + verified.fee;
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
            deliveryZone: `${verified.distanceKm.toFixed(1)}km`,
            deliveryAddress,
            deliveryFee: verified.fee,
            distanceKm: verified.distanceKm,
            customerName,
            customerPhone,
            comment: orderComment,
            subtotal,
        });

        // Submit to API (kitchen sees it via PostgreSQL)
        let apiOrderNumber = null;
        try {
            const apiOrder = await submitOrder({
                items: items.map(i => ({ name: i.name, subtotal: i.subtotal, options: i.options })),
                delivery_zone: `${verified.distanceKm.toFixed(1)}km`,
                delivery_address: deliveryAddress,
                delivery_fee: verified.fee,
                distance_km: verified.distanceKm,
                customer_name: customerName,
                customer_phone: customerPhone,
                customer_email: customerEmail || undefined,
                comment: orderComment,
                branch_code: BRANCH || undefined,
            });
            apiOrderNumber = apiOrder.order_number;
            await updateOrderFields(order.id, { apiOrderNumber });
        } catch {
            // API failed — order saved locally only
        }

        // Stripe Checkout — redirect to payment page
        const orderNum = apiOrderNumber || order.orderNumber;
        try {
            const checkout = await createCheckoutSession({
                order_number: orderNum,
                total: subtotal + verified.fee,
                items: items.map(i => ({ name: i.name, subtotal: i.subtotal, qty: 1 })),
                delivery_fee: verified.fee,
                branch: BRANCH || '',
            });
            // Reset state before redirect
            verified = null;
            lastVerifiedAddress = '';
            await clear();
            // Redirect to Stripe hosted checkout
            window.location.href = checkout.checkout_url;
            return;
        } catch {
            // Stripe not configured — fall through to normal completion
            toast.addMessage(`${t('order.number')}${orderNum}`, 4000, 'success');
        }

        // Reset verification state
        verified = null;
        lastVerifiedAddress = '';

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
