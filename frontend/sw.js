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
precacheAndRoute([{"revision":"c76263155190c079b80af4dc3d801ca4","url":"index.html"},{"revision":"4657153bd71b59ea0a9d714a36182709","url":"style.css"},{"revision":"700fe1bd50b06514abd5d07ad0b10f29","url":"manifest.json"},{"revision":"f7ce7a65e696cf1c7f6c9c178521ffa5","url":"images/favicon.ico"},{"revision":"837203bf58b64b22b416f653dbf38588","url":"images/banner.webp"},{"revision":"c872e95f8758189aef7c5c1f9ee6c8b7","url":"locales/zh-TW.json"},{"revision":"af512c88e709085ed2602e76e2bb0816","url":"locales/en.json"},{"revision":"d07e96c274886ec7fcec111a823c8622","url":"locales/default.json"},{"revision":"831521010a2c939aa4dd94bcc36d005c","url":"stylesheets/toast.css"},{"revision":"e86cbae0d99d8a71436dee699ae8d765","url":"stylesheets/page.css"},{"revision":"adc6b76a03f10d7ba50e2f58e696eb0e","url":"stylesheets/page-walkie-typie.css"},{"revision":"3654bcf33d380d2929774b9e7c114566","url":"stylesheets/page-mods.css"},{"revision":"fac139289285a75c3040b0ee0aefc5d7","url":"stylesheets/page-misc.css"},{"revision":"171955920c2a41e9fb06bbb343f1dd57","url":"stylesheets/page-broadcast.css"},{"revision":"31771c4fe0f794298d882ea7afa9f190","url":"stylesheets/page-blackboard-vcs.css"},{"revision":"387e113d64e51fcfe385b4678222a65e","url":"stylesheets/page-blackboard-log.css"},{"revision":"927ce37f58c8926d084fac67e4b2346e","url":"stylesheets/page-auth.css"},{"revision":"de4e8fbde20e5e29b694aaca99014d7a","url":"stylesheets/page-ai-translate.css"},{"revision":"7747d97485f8470605b28cb7815724b5","url":"stylesheets/navi.css"},{"revision":"c635b3674ed386a757b20ed737e8bda2","url":"stylesheets/mod-shared.css"},{"revision":"997a48f18da5b6fa2a1e2d67015382b5","url":"stylesheets/layer.css"},{"revision":"d6868b539e69bd67de88819ae9b0ee64","url":"stylesheets/hud.css"},{"revision":"414a7ef86479c4d1f16ab4a43e16efda","url":"stylesheets/hint-panel.css"},{"revision":"b420b72f2128af3d2bebd927882aaf26","url":"stylesheets/feature-markdown.css"},{"revision":"94ceef21fcf4f9539820a45cada207b8","url":"stylesheets/editor-attachments.css"},{"revision":"6ffacd8fceb2b2035b391478702a8a8d","url":"stylesheets/crt-vfx.css"},{"revision":"b014602568d548c7984e46a78f00899d","url":"stylesheets/caret.css"},{"revision":"5909a7abd36689687be901c41a285252","url":"stylesheets/@media.css"},{"revision":"ce7339d798de3f362110cde9d2fb8d1f","url":"javascript/walkie-typie-vcs.js"},{"revision":"3548cebe8556de5bc9ac834b73867a45","url":"javascript/walkie-typie-text.js"},{"revision":"74cc737081df169a36bb2794ef4f9526","url":"javascript/walkie-typie-list.js"},{"revision":"dddcc7047b64c4f795e7b1ea745ff911","url":"javascript/walkie-typie-db.js"},{"revision":"df8c560a87426dd0200ae01412e72eb9","url":"javascript/walkie-typie-core.js"},{"revision":"aed74f5a8b5417e113bb3cb85fca6020","url":"javascript/walkie-typie-config.js"},{"revision":"bf24f8366e345fa862c8f442e73e39bc","url":"javascript/version.js"},{"revision":"3bd64b816a91261a53503bfd29c67a6e","url":"javascript/utils.js"},{"revision":"367299634aea03c628b4bd3fe764258a","url":"javascript/toast.js"},{"revision":"0977a0953873ee88d2c89d32b36e654d","url":"javascript/timer-group.js"},{"revision":"f811f89a4874db3221d00de39342fbd3","url":"javascript/theme-engine.js"},{"revision":"cf4caf3b8541a8d93c4c5bc81c4c190e","url":"javascript/textarea-tab.js"},{"revision":"7cd337b7baa1b57abd7102dd0e81f1e7","url":"javascript/settings.js"},{"revision":"0b76374f8724f7d10f3613212bab7cbe","url":"javascript/pwa.js"},{"revision":"ac31d73513ecfe6c756a78675579bf58","url":"javascript/pressStart.js"},{"revision":"b0ac23bc284c8661077897ff9dc7928e","url":"javascript/navi.js"},{"revision":"95caa37b75be7aa4bbf69710b030c771","url":"javascript/multiStepButton.js"},{"revision":"6b490fa6dd28ccf24978f502f3060ece","url":"javascript/mods-misc.js"},{"revision":"dfe08185c356746746271e9d954c7830","url":"javascript/mods-manager.js"},{"revision":"26754d202b3419ade8a42211bbbd9360","url":"javascript/mod-tools.js"},{"revision":"649aa0c3dd7a0216f19d0d6168b1439e","url":"javascript/mod-state.js"},{"revision":"22c08bb42402ac8994137c14fb5f04c1","url":"javascript/mod-registry.js"},{"revision":"8c808a4c1a1290ac6a41dd5f6d04f649","url":"javascript/mod-hooks.js"},{"revision":"ae0e7d16b112f121f95f168a42b85a1a","url":"javascript/mod-field-registry.js"},{"revision":"1b169f72153a5fee363feebd2a7e4707","url":"javascript/mod-context.js"},{"revision":"6933c12805691a5be1674c6661c7a13e","url":"javascript/mod-board-provider.js"},{"revision":"2f6bb946183f1f9a1e74bf42e0f29443","url":"javascript/misc.js"},{"revision":"9f2444ef9e087b58f2fef87ac9e4b490","url":"javascript/indexedDB.js"},{"revision":"a44cf58f6643a4811c035b6a13f34f6e","url":"javascript/i18n.js"},{"revision":"8003c6cf3183168bbfff9ea3727b5671","url":"javascript/hud.js"},{"revision":"589fb18b0d586f4141f2af09ed073d3d","url":"javascript/hint-panel.js"},{"revision":"eeb4e268f9081d96dc27d7d3bdf74af5","url":"javascript/feature-shelf.js"},{"revision":"087589c0aa525737255500b31e32354b","url":"javascript/feature-markdown.js"},{"revision":"f398c945f84ebfa724f8a15e3471654f","url":"javascript/editor-attachments.js"},{"revision":"b63047bb1e17d6cf69205a1ba70d441f","url":"javascript/echo-service.js"},{"revision":"b3a216380b17d05e0045b4ff82b68418","url":"javascript/broadcast-list.js"},{"revision":"051f516346567042882639d74bf1607a","url":"javascript/broadcast-db.js"},{"revision":"343c5bd7666f9af6b53eaf484e29fb2a","url":"javascript/broadcast-config.js"},{"revision":"77e95de3b4eeed16b67be6dea8de8540","url":"javascript/broadcast-channel.js"},{"revision":"364b5a026cddea159ce8b5688a0bde51","url":"javascript/blackboard.js"},{"revision":"ec3f61bcde4316c54f2bf1624dbf1bb5","url":"javascript/blackboard-vcs.js"},{"revision":"cb42e952f42b51005a8a3f5e799c702e","url":"javascript/blackboard-ui.js"},{"revision":"1383f61aa53c3403c6dd52fe2a1a8546","url":"javascript/blackboard-ui-list.js"},{"revision":"be14018c56b63009da153215b8be7bc8","url":"javascript/blackboard-sync.js"},{"revision":"6ca94bcb2db068587db2e69470658b4a","url":"javascript/blackboard-msg.js"},{"revision":"a90d341873918bc8f83e387801e18327","url":"javascript/blackboard-core.js"},{"revision":"e45841fa39f0557fdda32e7ccfb500bd","url":"javascript/auth.js"},{"revision":"4d237cc6017ab021ea325cace788c8ed","url":"javascript/audio.js"},{"revision":"40998c4730894d87525a2b4c89f79f59","url":"javascript/vendor/pusher.min.js"},{"revision":"bac0fd2451e4471b2c5fc2d3a803bbb8","url":"javascript/vendor/marked.min.js"},{"revision":"17ee5062ee22be8bfad840cb3ab43d2e","url":"javascript/vendor/echo.iife.js"},{"revision":"128455fc6ec42e06220aa9f24c5078df","url":"javascript/vendor/dexie.js"},{"revision":"ded8a94a1ec7fcccbba420fd6423ee6b","url":"javascript/services/webllm-service.js"},{"revision":"98c6e3008444bfa07774dbd84a9058d9","url":"javascript/services/walkie-typie-service.js"},{"revision":"db898a111e17ea69cab24bd71b3b418d","url":"javascript/services/translation-service.js"},{"revision":"5a3b1c2fd8f4befd89f12549d15d9658","url":"javascript/services/status-service.js"},{"revision":"9a8ba648c726b53602bbbc79e81fa363","url":"javascript/services/speech-service.js"},{"revision":"b7adf7ac27bea16a55d49f551eef824a","url":"javascript/services/mod-service.js"},{"revision":"d0f3d591d1d2cd36db4f807ff2305bf2","url":"javascript/services/llm-service.js"},{"revision":"b690836db05ab93310055a22338b47a7","url":"javascript/services/file-service.js"},{"revision":"d8c9d36fdf43a7ed62840da22a3c84a6","url":"javascript/services/broadcast-service.js"},{"revision":"84a444ee6843c7629ef0e29f78dd2d9c","url":"javascript/services/blackboard-service.js"},{"revision":"9598ee2fafe10c59504cd1d57db9a345","url":"javascript/services/auth-service.js"},{"revision":"773719180b3187f6d3c7e991b360c074","url":"javascript/services/api.js"},{"revision":"f247305477c4b0cfc3cc31ce1870d022","url":"mods/mod-loader.js"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UISelectOn.mp3"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UISelectOff.mp3"},{"revision":"1bc89ef29116e1dc5a03745cd351b0d1","url":"audio/UIPipboyOKPress.mp3"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UIPipboyOK.mp3"},{"revision":"56fc29d80060b4026598e5b99d5a41e6","url":"audio/UIGeneralOK.mp3"},{"revision":"d51eeb5c434bf2efa752d4d8d0d6eaf2","url":"audio/UIGeneralFocus.mp3"},{"revision":"b1e606d1601946bfbfff032fc8d001cd","url":"audio/UIGeneralCancel.mp3"},{"revision":"4cabb643ada5316dd9b2414e6b931044","url":"audio/Erase.mp3"},{"revision":"b3e7debd1cbde5ce7a6680c6cf63c6ca","url":"audio/Click.mp3"},{"revision":"22ded0720e2c741d3a08f943fb44170b","url":"audio/Cassette.mp3"}]);
cleanupOutdatedCaches();

// --- SPA navigation fallback: serve cached /index.html for all routes ---
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// --- Runtime SWR for non-precached same-origin requests (MOD files, etc.) ---
registerRoute(
  ({ request, url }) => {
    if (request.method !== 'GET') return false;
    if (url.pathname.startsWith('/api/')) return false;
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
