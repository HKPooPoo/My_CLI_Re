
const BASE_URL = '/api';

/**
 * Common API request handler
 * @param {string} endpoint - e.g. '/login' or '/walkie-typie/connections'
 * @param {object} options - fetch options
 * @returns {Promise<any>}
 */
export async function apiRequest(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    // Ensure we send cookies for session-based auth
    if (!config.credentials) {
        config.credentials = 'same-origin'; // or 'include'
    }

    try {
        const response = await fetch(url, config);

        // Handle 204 No Content
        if (response.status === 204) {
            return null;
        }

        const data = await response.json();

        if (!response.ok) {
            throw {
                status: response.status,
                message: data.message || 'API Request Failed',
                errors: data.errors || null,
            };
        }

        return data;
    } catch (error) {
        // Re-throw formatted error
        if (error.status) {
            throw error;
        }
        // Network errors or JSON parsing errors
        throw {
            status: 0,
            message: error.message || 'Network Error',
            errors: null,
        };
    }
}
