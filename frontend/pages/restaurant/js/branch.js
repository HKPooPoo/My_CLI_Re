/**
 * Branch code from URL path.
 * /pages/restaurant/TM01/menu/ → "TM01"
 */
const parts = location.pathname.split('/');
// parts: ['', 'pages', 'restaurant', 'TM01', 'menu', '']
export const BRANCH = parts[3] || '';
