/**
 * i18n — Lightweight Internationalisation Module
 * ================================================
 * - Locale files: /locales/{locale}.json  (fetched at runtime)
 * - Language detection: localStorage.getItem('locale') || 'en'
 * - DOM binding: data-i18n="key"  →  el.textContent
 *                data-i18n-placeholder="key"  →  el.placeholder
 * - JS usage: import { t } from './i18n.js';  then  t('auth.loginError')
 */

let _strings = {};

function getLocale() {
    try {
        return localStorage.getItem('locale') || 'default';
    } catch {
        return 'en';
    }
}

export async function initI18n() {
    const locale = getLocale();
    try {
        const res = await fetch(`/locales/${locale}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        _strings = await res.json();
    } catch {
        if (locale !== 'en') {
            try {
                const res = await fetch('/locales/en.json');
                _strings = await res.json();
            } catch {
                _strings = {};
            }
        } else {
            _strings = {};
        }
    }
    renderDOM();
    window.dispatchEvent(new CustomEvent('i18n:ready'));
}

/**
 * Translate a dot-notation key, optionally interpolating {variable} placeholders.
 * Falls back to the key itself if not found.
 *
 * @param {string} key   e.g. 'auth.loginError'
 * @param {object} vars  e.g. { uid: 'alice' }
 * @returns {string}
 */
export function t(key, vars = {}) {
    const str = key.split('.').reduce((o, k) => o?.[k], _strings) ?? key;
    return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

/**
 * Change the active locale, persist to localStorage, reload strings, and re-render DOM.
 * @param {string} locale  e.g. 'en' | 'zh-TW'
 */
export async function setLocale(locale) {
    try {
        localStorage.setItem('locale', locale);
    } catch { /* ignore */ }
    await initI18n();
}

/** Returns the currently active locale code. */
export function getActiveLocale() {
    return getLocale();
}

/** Scan the DOM and apply translations to all data-i18n / data-i18n-placeholder elements. */
function renderDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
}
