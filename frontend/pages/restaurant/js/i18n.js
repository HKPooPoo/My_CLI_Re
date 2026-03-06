/**
 * Restaurant i18n — lightweight, standalone
 * Detects locale from navigator.language, loads matching JSON, provides t() and localize().
 */

let strings = {};
let locale = 'zh-TW';

const SUPPORTED = ['zh-TW', 'en'];

function detectLocale() {
    const stored = localStorage.getItem('restaurant-locale');
    if (stored && SUPPORTED.includes(stored)) return stored;

    const lang = navigator.language;
    if (lang.startsWith('zh')) return 'zh-TW';
    return 'en';
}

export async function initI18n() {
    locale = detectLocale();
    try {
        const res = await fetch(`locales/${locale}.json`);
        strings = await res.json();
    } catch {
        strings = {};
    }
    renderDOM();
}

/** Static UI string lookup */
export function t(key) {
    return strings[key] ?? key;
}

/** Resolve DB multilingual JSONB object → string for current locale */
export function localize(obj) {
    if (typeof obj === 'string') return obj;
    if (obj == null) return '';
    return obj[locale] ?? obj['zh-TW'] ?? obj['en'] ?? Object.values(obj)[0] ?? '';
}

export function getLocale() {
    return locale;
}

export function setLocale(newLocale) {
    if (!SUPPORTED.includes(newLocale)) return;
    locale = newLocale;
    localStorage.setItem('restaurant-locale', locale);
    initI18n();
}

function renderDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        el.placeholder = t(key);
    });
}
