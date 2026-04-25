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
precacheAndRoute([{"revision":"6af5562820d04fa15539de6f3eb79802","url":"index.html"},{"revision":"87fe977e4e84bfed24c612927f198d33","url":"style.css"},{"revision":"700fe1bd50b06514abd5d07ad0b10f29","url":"manifest.json"},{"revision":"f7ce7a65e696cf1c7f6c9c178521ffa5","url":"images/favicon.ico"},{"revision":"b1049ea410dccab0788adeab701302d9","url":"locales/default.json"},{"revision":"371305499d913e6494f8e501f50295cd","url":"stylesheets/toast.css"},{"revision":"3ce47c5ec49a9cc075ed49b78f412eed","url":"stylesheets/page.css"},{"revision":"636b0ef9e8f5cd934225c9d2aaf2ee74","url":"stylesheets/page-walkie-typie.css"},{"revision":"19dacacc98f46fcd17a45884bb94560a","url":"stylesheets/page-misc.css"},{"revision":"5e500f439e63ddc2218f6b4aa2cd6ebb","url":"stylesheets/page-inbox.css"},{"revision":"85082c41931d1e0a90c542ffe6a72ff9","url":"stylesheets/page-broadcast.css"},{"revision":"56ee608848d28f23bf4a2a35c34baaa2","url":"stylesheets/page-blackboard-vcs.css"},{"revision":"582e58dbb90a639e08256f17c4a0ea76","url":"stylesheets/page-blackboard-log.css"},{"revision":"35d6be33705f1790aa7fe168091c59c4","url":"stylesheets/page-auth.css"},{"revision":"9231a343a13c910e4efc6b00c0b4373f","url":"stylesheets/navi.css"},{"revision":"b2ffe4f22054295978e15e10b443952c","url":"stylesheets/layer.css"},{"revision":"30557fa8923f1e9c3b5e8cc988ff679a","url":"stylesheets/hud.css"},{"revision":"be412075ca0d69e97eeec92eeeaa2c2d","url":"stylesheets/hint-panel.css"},{"revision":"cea0a6b1c94b37f35e9e3ca53176d5ec","url":"stylesheets/features.css"},{"revision":"b6410650804e03fdf298425c4a91edca","url":"stylesheets/editor-attachments.css"},{"revision":"dfeaaac2b3ef1e8208d4bd429a199f7f","url":"stylesheets/caret.css"},{"revision":"b5fe043d0ff37da6ea076844cc821ed4","url":"stylesheets/@media.css"},{"revision":"fdfc6da6904afdfac30f4026d19a5abb","url":"javascript/walkie-typie-vcs.js"},{"revision":"cd959d6276970bc53137cb22bbc3c95c","url":"javascript/walkie-typie-text.js"},{"revision":"54cfafd7b5a747bdb748028213a2167b","url":"javascript/walkie-typie-list.js"},{"revision":"dddcc7047b64c4f795e7b1ea745ff911","url":"javascript/walkie-typie-db.js"},{"revision":"e3ba2d5562524d3c8bb6147e9a8dae79","url":"javascript/walkie-typie-core.js"},{"revision":"b5a4f5a1614a2009a13b33e09d6b8956","url":"javascript/walkie-typie-config.js"},{"revision":"c8db24f520fb86e12c81beee6bcdb40f","url":"javascript/version.js"},{"revision":"3bd64b816a91261a53503bfd29c67a6e","url":"javascript/utils.js"},{"revision":"81ba42437fc278be618a381b091be403","url":"javascript/toast.js"},{"revision":"226583d149794c43b6e3565b6033a0ea","url":"javascript/timing.js"},{"revision":"0977a0953873ee88d2c89d32b36e654d","url":"javascript/timer-group.js"},{"revision":"cf4caf3b8541a8d93c4c5bc81c4c190e","url":"javascript/textarea-tab.js"},{"revision":"9ff0f0af162f2bea9c59ae8c04b2cb1c","url":"javascript/sync-service.js"},{"revision":"b9ae9211554ede7981fc6a829dbbcd7f","url":"javascript/settings.js"},{"revision":"b2407793139026591897a02045f161cd","url":"javascript/pwa.js"},{"revision":"7f71957e20c81f18b13b6f1bdd25f35c","url":"javascript/pressStart.js"},{"revision":"4e9a98c9e91615721b95c6ca68aa81be","url":"javascript/navi.js"},{"revision":"1570ec1e08b3ca030d1700a31a30c23b","url":"javascript/multiStepButton.js"},{"revision":"1512b7a4ed70760a5d9e79fb71a771a4","url":"javascript/misc.js"},{"revision":"0e4d655c272ac9f3c06270ebad3abd04","url":"javascript/list-status.js"},{"revision":"eae758de7745385994c47b9c8b40e056","url":"javascript/indexedDB.js"},{"revision":"4a5f2b092dfd268d130518b4d498844a","url":"javascript/inbox-thread.js"},{"revision":"6b0631a8fe59bd4b74249cc00f8e1de0","url":"javascript/inbox-list.js"},{"revision":"f6254a335c87365b2970735042cc7e44","url":"javascript/inbox-db.js"},{"revision":"d9df200ef6511f31d20e3ec14c952b11","url":"javascript/i18n.js"},{"revision":"f77083ac08f7c034e2119d2cfe0115a8","url":"javascript/hud.js"},{"revision":"d5b38d1119d2be5ea4b54a08b6d75ebe","url":"javascript/hint-panel.js"},{"revision":"b861a6eaee230c827a21a5862e6c5567","url":"javascript/feature-shelf.js"},{"revision":"f881d744ec95c9b1945ce4804fceb5b0","url":"javascript/feature-registry.js"},{"revision":"cbfe96430ff01372cb29cc53f8da4752","url":"javascript/editor-attachments.js"},{"revision":"b63047bb1e17d6cf69205a1ba70d441f","url":"javascript/echo-service.js"},{"revision":"1ed06f30601feff8d124f2a791ddb673","url":"javascript/dashboard.js"},{"revision":"ba1bf084d876790fc3177f037006f5f5","url":"javascript/cross-tab-sync.js"},{"revision":"bf98bf8b2ed2782527e51ef961b71029","url":"javascript/content-search.js"},{"revision":"71155a0d5850742e2198c2b1d2be5df3","url":"javascript/broadcast-list.js"},{"revision":"78a505359f0f82aed42d8a72003c9870","url":"javascript/broadcast-db.js"},{"revision":"fb47e8cc17c317466ead8e8bb3b255ff","url":"javascript/broadcast-config.js"},{"revision":"da82a7cf9e9ce8b5f0cf459fad12908c","url":"javascript/broadcast-channel.js"},{"revision":"b3540cd6143ce947ed6d35f7e02f3d34","url":"javascript/blackboard.js"},{"revision":"75a181c5a41a54e5ca0eb832fc1852da","url":"javascript/blackboard-vcs.js"},{"revision":"7b978a5bfc9f972caef68e76a9bb52ad","url":"javascript/blackboard-ui.js"},{"revision":"16b74f043da5c45cb8e8762b3b29def9","url":"javascript/blackboard-ui-list.js"},{"revision":"c675a546f00b96bb3c47a704dfbb3cca","url":"javascript/blackboard-sync.js"},{"revision":"a2ffd67a3007535249b27dccff3b1deb","url":"javascript/blackboard-msg.js"},{"revision":"9a7b81d64ead7cda69780cf20537bb42","url":"javascript/blackboard-core.js"},{"revision":"c33f5e2cc32c653e48823b57f74bacbf","url":"javascript/auth.js"},{"revision":"a98cfacaed20ec64778442ad8d9b2498","url":"javascript/auth-landing.js"},{"revision":"4d237cc6017ab021ea325cace788c8ed","url":"javascript/audio.js"},{"revision":"40998c4730894d87525a2b4c89f79f59","url":"javascript/vendor/pusher.min.js"},{"revision":"bac0fd2451e4471b2c5fc2d3a803bbb8","url":"javascript/vendor/marked.min.js"},{"revision":"17ee5062ee22be8bfad840cb3ab43d2e","url":"javascript/vendor/echo.iife.js"},{"revision":"128455fc6ec42e06220aa9f24c5078df","url":"javascript/vendor/dexie.js"},{"revision":"ded8a94a1ec7fcccbba420fd6423ee6b","url":"javascript/services/webllm-service.js"},{"revision":"98c6e3008444bfa07774dbd84a9058d9","url":"javascript/services/walkie-typie-service.js"},{"revision":"945a66194176b4beaf4f9184c2c61de1","url":"javascript/services/user-settings-service.js"},{"revision":"db898a111e17ea69cab24bd71b3b418d","url":"javascript/services/translation-service.js"},{"revision":"5a3b1c2fd8f4befd89f12549d15d9658","url":"javascript/services/status-service.js"},{"revision":"9a8ba648c726b53602bbbc79e81fa363","url":"javascript/services/speech-service.js"},{"revision":"b7adf7ac27bea16a55d49f551eef824a","url":"javascript/services/mod-service.js"},{"revision":"d0f3d591d1d2cd36db4f807ff2305bf2","url":"javascript/services/llm-service.js"},{"revision":"614eb0463d0c45673077d6928b0c33d8","url":"javascript/services/inbox-service.js"},{"revision":"a67dfeea2e8e929ab7d1f427b3719d47","url":"javascript/services/file-service.js"},{"revision":"9a2330574dbb7718543309f215b9e59d","url":"javascript/services/broadcast-whitelist-service.js"},{"revision":"d8c9d36fdf43a7ed62840da22a3c84a6","url":"javascript/services/broadcast-service.js"},{"revision":"0e85cec78829ef70a5023e91e61b4628","url":"javascript/services/broadcast-flashcards-service.js"},{"revision":"3b372b625c7a6d651d93993f63933833","url":"javascript/services/broadcast-calendar-service.js"},{"revision":"9c01a331b64a82da2cea1634b4f98eaf","url":"javascript/services/blackboard-service.js"},{"revision":"9ece717c63981ab25b1fa3e2e155cab1","url":"javascript/services/auth-service.js"},{"revision":"b05965f4453c26d8ca2f339671bc41b4","url":"javascript/services/api.js"},{"revision":"1f6e403e4820ed6c060625fe922cac4e","url":"javascript/features/whitelist.js"},{"revision":"37fc8a0ec3d9168a39e662a9eabaf03a","url":"javascript/features/llm.js"},{"revision":"7e734eeb4ba7c6836ad66978b985611e","url":"javascript/features/flashcard.js"},{"revision":"85c1e13d289e1891e2633ab3c317df2f","url":"javascript/features/file-attach.js"},{"revision":"60ec22260ff1867f7e4fb4c5c4cd7666","url":"javascript/features/calendar.js"},{"revision":"a816b490f830a995cd554db2a283d248","url":"javascript/ascii/toast-spinner.js"},{"revision":"00a3336d4bd10c3d58077af7af7256db","url":"javascript/ascii/shelf-spinner.js"},{"revision":"8c282d5ce0b2612558a910ec6aedf7bb","url":"javascript/ascii/index.js"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UISelectOn.mp3"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UISelectOff.mp3"},{"revision":"1bc89ef29116e1dc5a03745cd351b0d1","url":"audio/UIPipboyOKPress.mp3"},{"revision":"820df7e58c903c859f78b11a76af9c40","url":"audio/UIPipboyOK.mp3"},{"revision":"56fc29d80060b4026598e5b99d5a41e6","url":"audio/UIGeneralOK.mp3"},{"revision":"d51eeb5c434bf2efa752d4d8d0d6eaf2","url":"audio/UIGeneralFocus.mp3"},{"revision":"b1e606d1601946bfbfff032fc8d001cd","url":"audio/UIGeneralCancel.mp3"},{"revision":"4cabb643ada5316dd9b2414e6b931044","url":"audio/Erase.mp3"},{"revision":"b3e7debd1cbde5ce7a6680c6cf63c6ca","url":"audio/Click.mp3"},{"revision":"22ded0720e2c741d3a08f943fb44170b","url":"audio/Cassette.mp3"}]);
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
