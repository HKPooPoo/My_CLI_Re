/**
 * Language toggle — switches between zh-TW and en.
 * Reloads page to re-render all dynamic content with new locale.
 */

import { getLocale } from './i18n.js';

export function initLangToggle() {
    const el = document.getElementById('lang-toggle');
    if (!el) return;
    const current = getLocale();
    el.textContent = current === 'zh-TW' ? 'EN' : '中文';
    el.addEventListener('click', () => {
        localStorage.setItem('restaurant-locale', current === 'zh-TW' ? 'en' : 'zh-TW');
        location.reload();
    });
}
