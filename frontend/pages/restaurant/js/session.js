/**
 * Session management — stores check-in state in localStorage.
 * Provides getSession/setSession/clearSession/isCheckedIn.
 */

const STORAGE_KEY = 'restaurant-session';

export function getSession() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (new Date(session.expires_at) <= new Date()) {
            clearSession();
            return null;
        }
        return session;
    } catch {
        clearSession();
        return null;
    }
}

export function setSession(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('session:changed'));
}

export function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('session:changed'));
}

export function isCheckedIn() {
    return getSession() !== null;
}
