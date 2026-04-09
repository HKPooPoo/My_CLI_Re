/**
 * Shared Utilities
 * =================================================================
 * Single source of truth for common utility functions used across modules.
 * =================================================================
 */

/**
 * Format a Date.now() value to HKT ISO string.
 * @param {number|Date} [dateInput] - Timestamp or Date object. Defaults to now.
 * @returns {string} ISO string with +08:00 suffix.
 */
export function getHKTTimestamp(dateInput) {
    const now = dateInput ? new Date(dateInput) : new Date();
    const hktOffset = 8 * 60 * 60 * 1000;
    const hktTime = new Date(now.getTime() + hktOffset);
    return hktTime.toISOString().replace('Z', '+08:00');
}
