/**
 * Restaurant App — entry point (delivery prototype).
 * Initializes i18n + IndexedDB cart, boots page modules.
 * No session gating — all pages freely accessible.
 */

import { initI18n } from './i18n.js';
import { initCart } from './cart.js';

await initI18n();
await initCart();

// Boot page modules
import('./menu.js');
import('./cart-page.js');
import('./history-page.js');
import('./kitchen-page.js');
import('./kitchen-menu-page.js');
import('./delivery-page.js');
import('./console-page.js');
