const CACHE_NAME = 'blackboard-v2-dev-2026-02-17'; // Increment for immediate update
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/javascript/blackboard.js',
  '/javascript/indexedDB.js',
  '/javascript/vendor/dexie.js',
  '/favicon.ico',
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

// 激活：清理舊快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
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

  // 對於 HTML，優先使用 Network (確保首屏最新)
  if (event.request.mode === 'navigate') {
      event.respondWith(
          fetch(event.request).catch(() => {
              return caches.match(event.request);
          })
      );
      return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // [FIX]: 忽略 206 Partial Content (影片/音頻串流)，Cache API 不支援
        if (networkResponse.status === 206) {
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
