/**
 * Kitchen login — password only. Branch code read from URL path.
 */

import { t } from './i18n.js';
import { BRANCH } from './branch.js';
import { authenticateBranch } from './restaurant-api.js';

const page = document.getElementById('kitchen-login-page');

function render(error) {
    const errorHtml = error ? `<div class="delivery-error">${error}</div>` : '';
    page.innerHTML = `
        <div class="delivery-form delivery-login-form">
            <div class="delivery-form-title">${t('kitchen.login-title')}</div>
            <div class="delivery-session-bar">
                <span class="delivery-session-name">${t('kitchen.branch-code')}: ${BRANCH || '—'}</span>
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

    if (!BRANCH) {
        render(t('kitchen.no-branch'));
        return;
    }

    const password = document.getElementById('login-password')?.value.trim();
    if (!password) {
        render(t('deliverer.login-fill-all'));
        return;
    }

    btn.disabled = true;
    btn.textContent = '...';

    try {
        const branch = await authenticateBranch(BRANCH, password);
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
