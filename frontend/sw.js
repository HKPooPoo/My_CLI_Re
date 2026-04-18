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
precacheAndRoute([{"revision":"807ea706eb1dba2c269de245275700fd","url":"index.html"},{"revision":"1ea7d27b64b9085168ea72e816d474cb","url":"style.css"},{"revision":"700fe1bd50b06514abd5d07ad0b10f29","url":"manifest.json"},{"revision":"f7ce7a65e696cf1c7f6c9c178521ffa5","url":"images/favicon.ico"},{"revision":"837203bf58b64b22b416f653dbf38588","url":"images/banner.webp"},{"revision":"fd109c7f618404c365f5067b588394b5","url":"locales/zh-TW.json"},{"revision":"1cbd130689968a4cf3cc6c89c826848c","url":"locales/en.json"},{"revision":"47d3e270b40ef4a95c9dd1c95f89e583","url":"locales/default.json"},{"revision":"0dc6c4b182b15ef0585aeaa16683e0f7","url":"stylesheets/toast.css"},{"revision":"e86cbae0d99d8a71436dee699ae8d765","url":"stylesheets/page.css"},{"revision":"adc6b76a03f10d7ba50e2f58e696eb0e","url":"stylesheets/page-walkie-typie.css"},{"revision":"3654bcf33d380d2929774b9e7c114566","url":"stylesheets/page-mods.css"},{"revision":"a6031d3cace511bd5deb7c3b9be45591","url":"stylesheets/page-misc.css"},{"revision":"171955920c2a41e9fb06bbb343f1dd57","url":"stylesheets/page-broadcast.css"},{"revision":"99274b8d6fbb5f48cf00de031c051065","url":"stylesheets/page-blackboard-vcs.css"},{"revision":"387e113d64e51fcfe385b4678222a65e","url":"stylesheets/page-blackboard-log.css"},{"revision":"927ce37f58c8926d084fac67e4b2346e","url":"stylesheets/page-auth.css"},{"revision":"7747d97485f8470605b28cb7815724b5","url":"stylesheets/navi.css"},{"revision":"c635b3674ed386a757b20ed737e8bda2","url":"stylesheets/mod-shared.css"},{"revision":"997a48f18da5b6fa2a1e2d67015382b5","url":"stylesheets/layer.css"},{"revision":"81f6b40becad7eb03696baf4d284b293","url":"stylesheets/hud.css"},{"revision":"78418248a670a077e53e66180fe6563b","url":"stylesheets/hint-panel.css"},{"revision":"b420b72f2128af3d2bebd927882aaf26","url":"stylesheets/feature-markdown.css"},{"revision":"d4bd1209636566f234d1bedc8d3b5dca","url":"stylesheets/editor-attachments.css"},{"revision":"469b6ab4183d98702d40babd888d234d","url":"stylesheets/crt-vfx.css"},{"revision":"b014602568d548c7984e46a78f00899d","url":"stylesheets/caret.css"},{"revision":"5909a7abd36689687be901c41a285252","url":"stylesheets/@media.css"},{"revision":"5eed65ebc0222fc47d7f4e450c07412e","url":"javascript/walkie-typie-vcs.js"},{"revision":"797268b8d5d21b2f046d2fd55dd9de07","url":"javascript/walkie-typie-text.js"},{"revision":"2ef16c2deadd5e29d82943009ee83f92","url":"javascript/walkie-typie-list.js"},{"revision":"dddcc7047b64c4f795e7b1ea745ff911","url":"javascript/walkie-typie-db.js"},{"revision":"f45f7425160d4100d52b07a01f8f100d","url":"javascript/walkie-typie-core.js"},{"revision":"7d57e31de63ea613f3337072f422233c","url":"javascript/walkie-typie-config.js"},{"revision":"bf24f8366e345fa862c8f442e73e39bc","url":"javascript/version.js"},{"revision":"3bd64b816a91261a53503bfd29c67a6e","url":"javascript/utils.js"},{"revision":"c3abc30841e7ce6e4130bffdfec736c3","url":"javascript/toast.js"},{"revision":"226583d149794c43b6e3565b6033a0ea","url":"javascript/timing.js"},{"revision":"0977a0953873ee88d2c89d32b36e654d","url":"javascript/timer-group.js"},{"revision":"f811f89a4874db3221d00de39342fbd3","url":"javascript/theme-engine.js"},{"revision":"cf4caf3b8541a8d93c4c5bc81c4c190e","url":"javascript/textarea-tab.js"},{"revision":"33263a2dc87aaebd620569a9d53f99d4","url":"javascript/settings.js"},{"revision":"0b76374f8724f7d10f3613212bab7cbe","url":"javascript/pwa.js"},{"revision":"5788c341c2c20fc186466e1231b87741","url":"javascript/pressStart.js"},{"revision":"4d4661c6265336b3046e2ace2f982be4","url":"javascript/navi.js"},{"revision":"5252ff39408aa1c05e0d2920eb95c06d","url":"javascript/multiStepButton.js"},{"revision":"77a7ff4bd8d56bbc95d9f1e5ca382300","url":"javascript/mods-misc.js"},{"revision":"3fb64fdd372778dc7048070b58fe9bf6","url":"javascript/mods-manager.js"},{"revision":"26754d202b3419ade8a42211bbbd9360","url":"javascript/mod-tools.js"},{"revision":"649aa0c3dd7a0216f19d0d6168b1439e","url":"javascript/mod-state.js"},{"revision":"8c808a4c1a1290ac6a41dd5f6d04f649","url":"javascript/mod-hooks.js"},{"revision":"ae0e7d16b112f121f95f168a42b85a1a","url":"javascript/mod-field-registry.js"},{"revision":"01e192165f51ec9c1909f63fb7ef2a13","url":"javascript/mod-context.js"},{"revision":"6933c12805691a5be1674c6661c7a13e","url":"javascript/mod-board-provider.js"},{"revision":"932df0f22a8d2dabd26206ac9030cd8d","url":"javascript/misc.js"},{"revision":"9f2444ef9e087b58f2fef87ac9e4b490","url":"javascript/indexedDB.js"},{"revision":"a44cf58f6643a4811c035b6a13f34f6e","url":"javascript/i18n.js"},{"revision":"22c6c5a8925e759a1e404369442be9b5","url":"javascript/hud.js"},{"revision":"d5b38d1119d2be5ea4b54a08b6d75ebe","url":"javascript/hint-panel.js"},{"revision":"7755c55da7bb9bdae68f60aa726e4a36","url":"javascript/feature-shelf.js"},{"revision":"087589c0aa525737255500b31e32354b","url":"javascript/feature-markdown.js"},{"revision":"c30ad74cceecec364ab171ace1074c15","url":"javascript/editor-attachments.js"},{"revision":"b63047bb1e17d6cf69205a1ba70d441f","url":"javascript/echo-service.js"},{"revision":"ba1bf084d876790fc3177f037006f5f5","url":"javascript/cross-tab-sync.js"},{"revision":"6c757abd74f176cc57d7def4a4090ac3","url":"javascript/broadcast-list.js"},{"revision":"051f516346567042882639d74bf1607a","url":"javascript/broadcast-db.js"},{"revision":"49e5c3aedc2752165997c9f8464c3765","url":"javascript/broadcast-config.js"},{"revision":"2e9f3d4e06db1176c6229454c9ea899a","url":"javascript/broadcast-channel.js"},{"revision":"f5293f433a484d01e0a5d531a4e16f54","url":"javascript/blackboard.js"},{"revision":"1ec044e7eb08daf22e404875b0df0005","url":"javascript/blackboard-vcs.js"},{"revision":"5bc08242fa4035ac22453eecf160fc11","url":"javascript/blackboard-ui.js"},{"revision":"f329b726768cce6c9ed46c087b7f8c20","url":"javascript/blackboard-ui-list.js"},{"revision":"5aca594f2dfbb4add1ff2f5cc79ad782","url":"javascript/blackboard-sync.js"},{"revision":"a2ffd67a3007535249b27dccff3b1deb","url":"javascript/blackboard-msg.js"},{"revision":"4f482beb59055a825d80ae4393b650a3","url":"javascript/blackboard-core.js"},{"revision":"8d03885c9ebe6d5902bc56ce907a2c93","url":"javascript/auth.js"},{"revision":"4d237cc6017ab021ea325cace788c8ed","url":"javascript/audio.js"},{"revision":"40998c4730894d87525a2b4c89f79f59","url":"javascript/vendor/pusher.min.js"},{"revision":"bac0fd2451e4471b2c5fc2d3a803bbb8","url":"javascript/vendor/marked.min.js"},{"revision":"17ee5062ee22be8bfad840cb3ab43d2e","url":"javascript/vendor/echo.iife.js"},{"revision":"128455fc6ec42e06220aa9f24c5078df","url":"javascript/vendor/dexie.js"},{"revision":"ded8a94a1ec7fcccbba420fd6423ee6b","url":"javascript/services/webllm-service.js"},{"revision":"98c6e3008444bfa07774dbd84a9058d9","url":"javascript/services/walkie-typie-service.js"},{"revision":"db898a111e17ea69cab24bd71b3b418d","url":"javascript/services/translation-service.js"},{"revision":"5a3b1c2fd8f4befd89f12549d15d9658","url":"javascript/services/status-service.js"},{"revision":"9a8ba648c726b53602bbbc79e81fa363","url":"javascript/services/speech-service.js"},{"revision":"b7adf7ac27bea16a55d49f551eef824a","url":"javascript/services/mod-service.js"},{"revision":"d0f3d591d1d2cd36db4f807ff2305bf2","url":"javascript/services/llm-service.js"},{"revision":"99f41a029b511d3db886b62d57eecd5a","url":"javascript/services/file-service.js"},{"revision":"d8c9d36fdf43a7ed62840da22a3c84a6","url":"javascript/services/broadcast-service.js"},{"revision":"9c01a331b64a82da2cea1634b4f98eaf","url":"javascript/services/blackboard-service.js"},{"revision":"9ece717c63981ab25b1fa3e2e155cab1","url":"javascript/services/auth-service.js"},{"revision":"b05965f4453c26d8ca2f339671bc41b4","url":"javascript/services/api.js"},{"revision":"29ba88a1462ef35174c5efa730fe6734","url":"mods/mod-loader.js"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UISelectOn.mp3"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UISelectOff.mp3"},{"revision":"1bc89ef29116e1dc5a03745cd351b0d1","url":"audio/UIPipboyOKPress.mp3"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UIPipboyOK.mp3"},{"revision":"56fc29d80060b4026598e5b99d5a41e6","url":"audio/UIGeneralOK.mp3"},{"revision":"d51eeb5c434bf2efa752d4d8d0d6eaf2","url":"audio/UIGeneralFocus.mp3"},{"revision":"b1e606d1601946bfbfff032fc8d001cd","url":"audio/UIGeneralCancel.mp3"},{"revision":"4cabb643ada5316dd9b2414e6b931044","url":"audio/Erase.mp3"},{"revision":"b3e7debd1cbde5ce7a6680c6cf63c6ca","url":"audio/Click.mp3"},{"revision":"22ded0720e2c741d3a08f943fb44170b","url":"audio/Cassette.mp3"}]);
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
