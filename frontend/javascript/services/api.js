
const BASE_URL = '/api';
const DEFAULT_TIMEOUT = 15000; // 15 seconds

/**
 * Common API request handler
 * @param {string} endpoint - e.g. '/login' or '/walkie-typie/connections'
 * @param {object} options - fetch options + optional `timeout` (ms)
 * @returns {Promise<any>}
 */
export async function apiRequest(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };

    // Timeout via AbortController — skip if caller already provides a signal
    let controller = null;
    let timeoutId = null;
    if (!options.signal && timeout > 0) {
        controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeout);
    }

    const { timeout: _omit, ...fetchOptions } = options;

    const config = {
        ...fetchOptions,
        headers: {
            ...defaultHeaders,
            ...fetchOptions.headers,
        },
        signal: options.signal || controller?.signal,
    };

    // Ensure we send cookies for session-based auth
    if (!config.credentials) {
        config.credentials = 'same-origin';
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
        // AbortError from timeout
        if (error.name === 'AbortError') {
            throw {
                status: 0,
                message: controller ? 'Request timed out' : 'Request aborted',
                errors: null,
            };
        }
        // Network errors or JSON parsing errors
        throw {
            status: 0,
            message: error.message || 'Network Error',
            errors: null,
        };
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}
