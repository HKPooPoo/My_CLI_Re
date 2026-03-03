const CACHE_NAME = 'blackboard-v86-2026-03-04';

// Core framework only — MOD files (mods/*, vendor libs, MOD assets) are NOT listed here.
// They are cached lazily via the stale-while-revalidate fetch handler on first page load.
// mod-loader.js discovers MOD folders at runtime via Nginx autoindex JSON.
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/stylesheets/editor-attachments.css',
  '/stylesheets/page-walkie-typie.css',
  '/javascript/blackboard.js',
  '/javascript/blackboard-sync.js',
  '/javascript/editor-attachments.js',
  '/javascript/services/file-service.js',
  '/javascript/indexedDB.js',
  '/javascript/vendor/dexie.js',
  '/javascript/walkie-typie-core.js',
  '/javascript/walkie-typie-list.js',
  '/javascript/walkie-typie-text.js',
  '/javascript/walkie-typie-vcs.js',
  '/javascript/walkie-typie-db.js',
  '/javascript/echo-service.js',
  '/javascript/broadcast-channel.js',
  '/javascript/broadcast-list.js',
  '/javascript/broadcast-config.js',
  '/javascript/walkie-typie-config.js',
  '/javascript/settings.js',
  '/javascript/audio.js',
  '/javascript/feature-shelf.js',
  '/javascript/mod-state.js',
  '/javascript/mod-context.js',
  '/javascript/mod-hooks.js',
  '/javascript/mod-tools.js',
  '/javascript/mod-board-provider.js',
  '/javascript/mod-field-registry.js',
  '/javascript/mods-manager.js',
  '/javascript/blackboard-msg.js',
  '/javascript/version.js',
  '/javascript/theme-engine.js',
  '/mods/mod-loader.js',
  '/audio/Cassette.mp3',
  '/audio/Click.mp3',
  '/audio/Erase.mp3',
  '/audio/UIGeneralCancel.mp3',
  '/audio/UIGeneralFocus.mp3',
  '/audio/UIGeneralOK.mp3',
  '/audio/UIPipboyOK.mp3',
  '/audio/UIPipboyOKPress.mp3',
  '/audio/UISelectOff.mp3',
  '/audio/UISelectOn.mp3',
  '/images/favicon.ico',
  '/manifest.json'
];

// 安裝：快取核心資源
self.addEventListener('install', (event) => {
  self.skipWaiting(); // 強制跳過等待，立即啟用新版 SW (Dev Friendly)

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 激活：清理舊快取（保留第三方快取如 Transformers.js 模型）
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key.startsWith('blackboard-'))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim()) // 立即接管頁面
  );
});

// 處理訊息 (SKIP_WAITING)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 攔截請求：Stale-While-Revalidate 策略
self.addEventListener('fetch', (event) => {
  // 僅處理 GET 請求且不處理 API
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  // [FIX]: Ignore chrome-extension scheme to prevent "unsupported scheme" errors
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // [FIX]: Only intercept same-origin requests — never try to cache/fetch
  // third-party resources (analytics, CDN, Cloudflare beacon, etc.) as
  // cross-origin fetches from SW context fail with NetworkError and the
  // rejected promise surfaces as a console error on the page.
  if (new URL(event.request.url).origin !== location.origin) {
    return;
  }

  // 對於 HTML，優先使用 Network (確保首屏最新)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' }).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // [FIX]: Use no-cache to bypass browser HTTP cache during background revalidation
      // — ensures stale-while-revalidate actually gets fresh files from server
      const fetchPromise = fetch(event.request, { cache: 'no-cache' }).then((networkResponse) => {
        // [FIX]: Only cache successful (2xx) responses — never cache 403/404/500
        // errors, which would poison the SWR cache and break MOD loading.
        // Also skip 206 Partial Content (streaming) — Cache API doesn't support it.
        if (!networkResponse.ok || networkResponse.status === 206) {
          return networkResponse;
        }

        // [FIX]: 必須立即克隆響應，否則在寫入快取前可能已被瀏覽器消耗
        const responseToCache = networkResponse.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
