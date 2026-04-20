/**
 * Service Worker — Source Template
 * =================================================================
 * Build: node scripts/build-sw.js
 * Output: frontend/sw.js (auto-generated, do not edit directly)
 *
 * Workbox injectManifest replaces the manifest placeholder
 * with a versioned file list + content hashes at build time.
 * =================================================================
 */

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');

const { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } = workbox.precaching;
const { registerRoute, NavigationRoute } = workbox.routing;
const { StaleWhileRevalidate } = workbox.strategies;

// --- Precache: auto-generated manifest injected by build script ---
precacheAndRoute([{"revision":"ce685cb7bd28578b61e832452e751938","url":"index.html"},{"revision":"7a56b1e25fc9f48d4d3ad1bf2d4db305","url":"style.css"},{"revision":"700fe1bd50b06514abd5d07ad0b10f29","url":"manifest.json"},{"revision":"f7ce7a65e696cf1c7f6c9c178521ffa5","url":"images/favicon.ico"},{"revision":"837203bf58b64b22b416f653dbf38588","url":"images/banner.webp"},{"revision":"47bd0b34dab5ec9e10c9d41fcb05cad2","url":"locales/zh-TW.json"},{"revision":"f03067aac26ce380d8b95d97cb132309","url":"locales/en.json"},{"revision":"c5b17a3a287415c482cc989c24faba9d","url":"locales/default.json"},{"revision":"0dc6c4b182b15ef0585aeaa16683e0f7","url":"stylesheets/toast.css"},{"revision":"4a5830bc2e9aa4b5c4a6bbaa5171ce57","url":"stylesheets/page.css"},{"revision":"bf691e4f27764e1634954f1fd405d715","url":"stylesheets/page-walkie-typie.css"},{"revision":"f233a38c190bab7a1c9e4bee511580b2","url":"stylesheets/page-mods.css"},{"revision":"a6031d3cace511bd5deb7c3b9be45591","url":"stylesheets/page-misc.css"},{"revision":"2b9dc82cd66950e45bb239bce5fb05b7","url":"stylesheets/page-broadcast.css"},{"revision":"5a39cf694c5666103463ddc046580cb9","url":"stylesheets/page-blackboard-vcs.css"},{"revision":"387e113d64e51fcfe385b4678222a65e","url":"stylesheets/page-blackboard-log.css"},{"revision":"927ce37f58c8926d084fac67e4b2346e","url":"stylesheets/page-auth.css"},{"revision":"7747d97485f8470605b28cb7815724b5","url":"stylesheets/navi.css"},{"revision":"c635b3674ed386a757b20ed737e8bda2","url":"stylesheets/mod-shared.css"},{"revision":"997a48f18da5b6fa2a1e2d67015382b5","url":"stylesheets/layer.css"},{"revision":"81f6b40becad7eb03696baf4d284b293","url":"stylesheets/hud.css"},{"revision":"78418248a670a077e53e66180fe6563b","url":"stylesheets/hint-panel.css"},{"revision":"b420b72f2128af3d2bebd927882aaf26","url":"stylesheets/feature-markdown.css"},{"revision":"90af0842858c3ce75a4812335d4e6acf","url":"stylesheets/editor-attachments.css"},{"revision":"469b6ab4183d98702d40babd888d234d","url":"stylesheets/crt-vfx.css"},{"revision":"b014602568d548c7984e46a78f00899d","url":"stylesheets/caret.css"},{"revision":"eddc3d17ae1ddabfed9b390300e441b9","url":"stylesheets/@media.css"},{"revision":"5eed65ebc0222fc47d7f4e450c07412e","url":"javascript/walkie-typie-vcs.js"},{"revision":"e91f3734c10a74fbf89b3960db3b1daa","url":"javascript/walkie-typie-text.js"},{"revision":"fe6a3c03ad2ad764c96ec9e1bbaf5d74","url":"javascript/walkie-typie-list.js"},{"revision":"dddcc7047b64c4f795e7b1ea745ff911","url":"javascript/walkie-typie-db.js"},{"revision":"f45f7425160d4100d52b07a01f8f100d","url":"javascript/walkie-typie-core.js"},{"revision":"93fb0610d9789a8b36427af781204ab8","url":"javascript/walkie-typie-config.js"},{"revision":"bf24f8366e345fa862c8f442e73e39bc","url":"javascript/version.js"},{"revision":"3bd64b816a91261a53503bfd29c67a6e","url":"javascript/utils.js"},{"revision":"c3abc30841e7ce6e4130bffdfec736c3","url":"javascript/toast.js"},{"revision":"226583d149794c43b6e3565b6033a0ea","url":"javascript/timing.js"},{"revision":"0977a0953873ee88d2c89d32b36e654d","url":"javascript/timer-group.js"},{"revision":"f811f89a4874db3221d00de39342fbd3","url":"javascript/theme-engine.js"},{"revision":"cf4caf3b8541a8d93c4c5bc81c4c190e","url":"javascript/textarea-tab.js"},{"revision":"71a0aaa124f5fc52bb649db12718060f","url":"javascript/settings.js"},{"revision":"b2407793139026591897a02045f161cd","url":"javascript/pwa.js"},{"revision":"8d2c0c42bc6d185d7cdbbe6436898056","url":"javascript/pressStart.js"},{"revision":"4d4661c6265336b3046e2ace2f982be4","url":"javascript/navi.js"},{"revision":"1570ec1e08b3ca030d1700a31a30c23b","url":"javascript/multiStepButton.js"},{"revision":"77a7ff4bd8d56bbc95d9f1e5ca382300","url":"javascript/mods-misc.js"},{"revision":"2bfe7ff23c5c81c80b87c7356972c453","url":"javascript/mods-manager.js"},{"revision":"26754d202b3419ade8a42211bbbd9360","url":"javascript/mod-tools.js"},{"revision":"649aa0c3dd7a0216f19d0d6168b1439e","url":"javascript/mod-state.js"},{"revision":"8c808a4c1a1290ac6a41dd5f6d04f649","url":"javascript/mod-hooks.js"},{"revision":"ae0e7d16b112f121f95f168a42b85a1a","url":"javascript/mod-field-registry.js"},{"revision":"01e192165f51ec9c1909f63fb7ef2a13","url":"javascript/mod-context.js"},{"revision":"6933c12805691a5be1674c6661c7a13e","url":"javascript/mod-board-provider.js"},{"revision":"92de89c500fab17ad3047ded84a7369d","url":"javascript/misc.js"},{"revision":"9f2444ef9e087b58f2fef87ac9e4b490","url":"javascript/indexedDB.js"},{"revision":"a44cf58f6643a4811c035b6a13f34f6e","url":"javascript/i18n.js"},{"revision":"092bee721eb7682b6d7cc20f2426beba","url":"javascript/hud.js"},{"revision":"d5b38d1119d2be5ea4b54a08b6d75ebe","url":"javascript/hint-panel.js"},{"revision":"7755c55da7bb9bdae68f60aa726e4a36","url":"javascript/feature-shelf.js"},{"revision":"087589c0aa525737255500b31e32354b","url":"javascript/feature-markdown.js"},{"revision":"4f8fb8516a71fdb780d0e55e801dc447","url":"javascript/editor-attachments.js"},{"revision":"b63047bb1e17d6cf69205a1ba70d441f","url":"javascript/echo-service.js"},{"revision":"ba1bf084d876790fc3177f037006f5f5","url":"javascript/cross-tab-sync.js"},{"revision":"a8367c5972feafaf40bf8e90b7d8e369","url":"javascript/broadcast-list.js"},{"revision":"7f502c05f5f068b91f3ea6495a864129","url":"javascript/broadcast-db.js"},{"revision":"875b658ebf612e7ffba69fa73d5246ca","url":"javascript/broadcast-config.js"},{"revision":"32f5793b7657f01e950bc329f473eb94","url":"javascript/broadcast-channel.js"},{"revision":"248abcd5ba7b1dd6193a82c10a8eda46","url":"javascript/blackboard.js"},{"revision":"1ec044e7eb08daf22e404875b0df0005","url":"javascript/blackboard-vcs.js"},{"revision":"fb28104ba4198c7ae5a0e5065dc6d557","url":"javascript/blackboard-ui.js"},{"revision":"c1a0855aaa898fa0b1f3bc11527f7589","url":"javascript/blackboard-ui-list.js"},{"revision":"5aca594f2dfbb4add1ff2f5cc79ad782","url":"javascript/blackboard-sync.js"},{"revision":"a2ffd67a3007535249b27dccff3b1deb","url":"javascript/blackboard-msg.js"},{"revision":"03c7b52897a53d8959d34faae65ef4d8","url":"javascript/blackboard-core.js"},{"revision":"e18ee7bf2a88f56f1d02e46859772959","url":"javascript/auth.js"},{"revision":"4d237cc6017ab021ea325cace788c8ed","url":"javascript/audio.js"},{"revision":"40998c4730894d87525a2b4c89f79f59","url":"javascript/vendor/pusher.min.js"},{"revision":"bac0fd2451e4471b2c5fc2d3a803bbb8","url":"javascript/vendor/marked.min.js"},{"revision":"17ee5062ee22be8bfad840cb3ab43d2e","url":"javascript/vendor/echo.iife.js"},{"revision":"128455fc6ec42e06220aa9f24c5078df","url":"javascript/vendor/dexie.js"},{"revision":"ded8a94a1ec7fcccbba420fd6423ee6b","url":"javascript/services/webllm-service.js"},{"revision":"98c6e3008444bfa07774dbd84a9058d9","url":"javascript/services/walkie-typie-service.js"},{"revision":"db898a111e17ea69cab24bd71b3b418d","url":"javascript/services/translation-service.js"},{"revision":"5a3b1c2fd8f4befd89f12549d15d9658","url":"javascript/services/status-service.js"},{"revision":"9a8ba648c726b53602bbbc79e81fa363","url":"javascript/services/speech-service.js"},{"revision":"b7adf7ac27bea16a55d49f551eef824a","url":"javascript/services/mod-service.js"},{"revision":"d0f3d591d1d2cd36db4f807ff2305bf2","url":"javascript/services/llm-service.js"},{"revision":"a67dfeea2e8e929ab7d1f427b3719d47","url":"javascript/services/file-service.js"},{"revision":"d8c9d36fdf43a7ed62840da22a3c84a6","url":"javascript/services/broadcast-service.js"},{"revision":"9c01a331b64a82da2cea1634b4f98eaf","url":"javascript/services/blackboard-service.js"},{"revision":"9ece717c63981ab25b1fa3e2e155cab1","url":"javascript/services/auth-service.js"},{"revision":"b05965f4453c26d8ca2f339671bc41b4","url":"javascript/services/api.js"},{"revision":"29ba88a1462ef35174c5efa730fe6734","url":"mods/mod-loader.js"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UISelectOn.mp3"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UISelectOff.mp3"},{"revision":"1bc89ef29116e1dc5a03745cd351b0d1","url":"audio/UIPipboyOKPress.mp3"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UIPipboyOK.mp3"},{"revision":"56fc29d80060b4026598e5b99d5a41e6","url":"audio/UIGeneralOK.mp3"},{"revision":"d51eeb5c434bf2efa752d4d8d0d6eaf2","url":"audio/UIGeneralFocus.mp3"},{"revision":"b1e606d1601946bfbfff032fc8d001cd","url":"audio/UIGeneralCancel.mp3"},{"revision":"4cabb643ada5316dd9b2414e6b931044","url":"audio/Erase.mp3"},{"revision":"b3e7debd1cbde5ce7a6680c6cf63c6ca","url":"audio/Click.mp3"},{"revision":"22ded0720e2c741d3a08f943fb44170b","url":"audio/Cassette.mp3"}]);
cleanupOutdatedCaches();

// --- SPA navigation fallback: serve cached /index.html for all routes ---
// Denylist:
//   /pages/ — standalone pages NOT hijacked back to main SPA
//   /api/   — file downloads opened in new tab (e.g., clicking a SYNCED
//             chip icon navigates to /api/files/{hash}); without this
//             exclusion the SW returns cached index.html instead of the
//             actual file, and the browser renders the SPA shell under
//             the /api/files/ path where relative CSS links 404.
registerRoute(new NavigationRoute(
  createHandlerBoundToURL('/index.html'),
  { denylist: [/\/pages\//, /^\/api\//] }
));

// --- Runtime SWR for non-precached same-origin requests (MOD files, etc.) ---
registerRoute(
  ({ request, url }) => {
    if (request.method !== 'GET') return false;
    if (url.pathname.startsWith('/api/')) return false;
    if (url.pathname.startsWith('/pages/')) return false;
    if (url.origin !== self.location.origin) return false;
    return true;
  },
  new StaleWhileRevalidate({
    cacheName: 'runtime-swr',
    plugins: [{
      // Only cache successful responses — never poison cache with 403/404/500
      cacheWillUpdate: async ({ response }) => (response?.ok ? response : null),
    }],
  })
);

// --- Lifecycle ---
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Clean up legacy blackboard-* caches from before Workbox migration
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('blackboard-')).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Handle SKIP_WAITING message from pwa.js update flow
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
