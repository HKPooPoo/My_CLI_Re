/**
 * Deliverer login page — authenticates via API (phone + password).
 * On success, saves session to localStorage and reloads.
 */

import { t } from './i18n.js';
import { authenticateDeliverer } from './restaurant-api.js';

const page = document.getElementById('delivery-login-page');

function render(error) {
    const errorHtml = error ? `<div class="delivery-error">${error}</div>` : '';
    page.innerHTML = `
        <div class="delivery-form delivery-login-form">
            <div class="delivery-form-title">${t('deliverer.login-title')}</div>
            <div class="checkout-field">
                <label class="checkout-label">${t('deliverer.phone')}</label>
                <input type="tel" id="login-phone" class="checkout-input" placeholder="${t('cart.phone-placeholder')}" inputmode="tel">
            </div>
            <div class="checkout-field">
                <label class="checkout-label">${t('deliverer.password')}</label>
                <input type="password" id="login-password" class="checkout-input" placeholder="${t('deliverer.password')}">
            </div>
            ${errorHtml}
            <button class="checkout-btn" id="login-submit">${t('deliverer.login-btn')}</button>
        </div>
    `;
}

page.addEventListener('click', async (e) => {
    const btn = e.target.closest('#login-submit');
    if (!btn || btn.disabled) return;

    const phone = document.getElementById('login-phone')?.value.trim();
    const password = document.getElementById('login-password')?.value.trim();

    if (!phone || !password) {
        render(t('deliverer.login-fill-all'));
        return;
    }

    btn.disabled = true;
    btn.textContent = '...';

    try {
        const deliverer = await authenticateDeliverer(phone, password);
        localStorage.setItem('deliverer-session', JSON.stringify({
            id: deliverer.id,
            phone: deliverer.phone,
            name: deliverer.name,
            token: deliverer.session_token,
        }));
        location.reload();
    } catch {
        render(t('deliverer.login-error'));
    }
});

render();
