/**
 * Restaurant App — entry point
 * Initializes i18n, then boots page modules.
 */

import { initI18n } from './i18n.js';

await initI18n();

import('./menu.js');
import('./cart-page.js');
