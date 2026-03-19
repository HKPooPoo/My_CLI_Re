/**
 * Kitchen deliverer registration page — registers via API.
 */

import { t } from './i18n.js';
import { registerDeliverer } from './restaurant-api.js';
import { ToastMessager } from '/javascript/toast.js';

const page = document.getElementById('deliverer-register-page');
const toast = new ToastMessager();

function render() {
    page.innerHTML = `
        <div class="register-form">
            <div class="delivery-form-title">${t('deliverer.register-title')}</div>
            <div class="checkout-field">
                <label class="checkout-label">${t('deliverer.name')}</label>
                <input type="text" id="reg-name" class="checkout-input" placeholder="${t('deliverer.name')}">
            </div>
            <div class="checkout-field">
                <label class="checkout-label">${t('deliverer.phone')}</label>
                <input type="tel" id="reg-phone" class="checkout-input" placeholder="${t('cart.phone-placeholder')}">
            </div>
            <div class="checkout-field">
                <label class="checkout-label">${t('deliverer.password')}</label>
                <input type="password" id="reg-password" class="checkout-input" placeholder="${t('deliverer.password')}">
            </div>
            <div id="reg-error" class="checkout-error" hidden></div>
            <button class="checkout-btn" id="reg-submit-btn">${t('deliverer.register-btn')}</button>
        </div>
    `;
}

page.addEventListener('click', async (e) => {
    const submitBtn = e.target.closest('#reg-submit-btn');
    if (!submitBtn || submitBtn.disabled) return;

    const name = document.getElementById('reg-name')?.value.trim();
    const phone = document.getElementById('reg-phone')?.value.trim();
    const password = document.getElementById('reg-password')?.value.trim();
    const errEl = document.getElementById('reg-error');

    let error = '';
    if (!name) error = t('deliverer.error-name');
    else if (!phone) error = t('deliverer.error-phone');
    else if (!password) error = t('deliverer.error-password');

    if (error) {
        if (errEl) { errEl.textContent = error; errEl.hidden = false; }
        return;
    }

    submitBtn.disabled = true;
    try {
        const deliverer = await registerDeliverer({ name, phone, password });
        toast.addMessage(`${t('deliverer.registered')} ${deliverer.name}`, 3000, 'success');
        render();
    } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.hidden = false; }
    } finally {
        submitBtn.disabled = false;
    }
});

render();
