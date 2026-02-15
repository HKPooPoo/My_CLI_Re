const CACHE_NAME = 'blackboard-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/stylesheets/style.css',
  '/javascript/blackboard.js',
  '/javascript/indexedDB.js',
  '/javascript/vendor/dexie.js',
  '/favicon.ico'
];

// 安裝：快取核心資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 激活：清理舊快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// 攔截請求：Stale-While-Revalidate 策略
self.addEventListener('fetch', (event) => {
  // 僅處理 GET 請求且不處理 API
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      });
      return cachedResponse || fetchPromise;
    })
  );
});
