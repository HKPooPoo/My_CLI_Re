/**
 * Restaurant App — entry point
 * Initializes i18n + IndexedDB cart, then boots page modules.
 */

import { initI18n } from './i18n.js';
import { initCart } from './cart.js';

await initI18n();
await initCart();

import('./menu.js');
import('./cart-page.js');
import('./receipt-page.js');
import('./kitchen-page.js');
import('./console-page.js');
