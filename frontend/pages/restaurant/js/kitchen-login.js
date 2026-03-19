/**
 * Kitchen login page — authenticates with branch code + password.
 * On success, saves branch session to localStorage and reloads.
 */

import { t } from './i18n.js';
import { authenticateBranch } from './restaurant-api.js';

const page = document.getElementById('kitchen-login-page');

function render(error) {
    const errorHtml = error ? `<div class="delivery-error">${error}</div>` : '';
    page.innerHTML = `
        <div class="delivery-form delivery-login-form">
            <div class="delivery-form-title">${t('kitchen.login-title')}</div>
            <div class="checkout-field">
                <label class="checkout-label">${t('kitchen.branch-code')}</label>
                <input type="text" id="login-branch" class="checkout-input" placeholder="TM" autocomplete="off">
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

    const code = document.getElementById('login-branch')?.value.trim().toUpperCase();
    const password = document.getElementById('login-password')?.value.trim();

    if (!code || !password) {
        render(t('deliverer.login-fill-all'));
        return;
    }

    btn.disabled = true;
    btn.textContent = '...';

    try {
        const branch = await authenticateBranch(code, password);
        localStorage.setItem('kitchen-session', JSON.stringify({
            id: branch.id,
            code: branch.code,
            name: branch.name,
        }));
        location.reload();
    } catch {
        render(t('deliverer.login-error'));
    }
});

render();
