import { apiRequest } from './api.js';

export const AuthService = {
    getStatus() {
        return apiRequest('/auth-status', { method: 'GET' });
    },
    login(credentials) {
        return apiRequest('/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
    },
    register(credentials) {
        return apiRequest('/register', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
    },
    logout() {
        return apiRequest('/logout', { method: 'POST' });
    },
    executeCommand(commandData) {
        return apiRequest('/auth/command', {
            method: 'POST',
            body: JSON.stringify(commandData)
        });
    },
    requestPasswordReset(data) {
        return apiRequest('/auth/request-reset', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    requestEmailBinding(data) {
        return apiRequest('/auth/request-bind', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};
