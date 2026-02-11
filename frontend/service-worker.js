// Service Worker for My CLI — Offline-First Caching
// Version bump this to force cache refresh on deploy
const CACHE_VERSION = 'my-cli-v1';

// Core assets to cache on install
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/style.css',

    // Stylesheets
    '/stylesheets/hud.css',
    '/stylesheets/crt-vfx.css',
    '/stylesheets/navi.css',
    '/stylesheets/page.css',
    '/stylesheets/layer.css',
    '/stylesheets/page-auth.css',
    '/stylesheets/page-blackboard-log.css',
    '/stylesheets/@media.css',
    '/stylesheets/page-ai-translate.css',

    // JavaScript
    '/javascript/audio.js',
    '/javascript/navi.js',
    '/javascript/pressStart.js',
    '/javascript/hud.js',
    '/javascript/blackboard.js',
    '/javascript/feature.js',
    '/javascript/feature-shelf.js',
    '/javascript/feature-translator.js',
    '/javascript/indexedDBfromDexie.js',
    '/javascript/crypto.js',

    // Images
    '/images/favicon.ico',
    '/images/banner.png',
    '/images/background.svg',
    '/images/theme_switch.svg',
    '/images/translate_en.svg',
    '/images/translate_ja.svg',
    '/images/translate_zh_cn.svg',
    '/images/translate_zh_tw.svg',
    '/images/translator.svg',
    '/images/voice_to_textbox.svg',

    // Audio
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
];

// External dependencies to cache
const EXTERNAL_ASSETS = [
    'https://unpkg.com/dexie@latest/dist/dexie.mjs',
];

// ─── Install: Pre-cache core assets ───
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then(async (cache) => {
            // Cache local assets
            await cache.addAll(CORE_ASSETS);

            // Cache external assets individually (don't fail install if CDN is down)
            for (const url of EXTERNAL_ASSETS) {
                try {
                    await cache.add(url);
                } catch (e) {
                    console.warn('SW: Failed to cache external asset:', url, e);
                }
            }
        })
    );
    // Activate immediately, don't wait for old SW to die
    self.skipWaiting();
});

// ─── Activate: Clean up old caches ───
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_VERSION)
                    .map((key) => caches.delete(key))
            );
        })
    );
    // Take control of all pages immediately
    self.clients.claim();
});

// ─── Fetch: Strategy per request type ───
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API requests (/api/*): Network Only
    // If offline, the fetch will fail and frontend handles the error
    // (DB: OFFLINE indicator already covers this)
    if (url.pathname.startsWith('/api')) {
        return; // Let the browser handle it normally
    }

    // Static assets: Cache First, fallback to Network
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            // Not in cache — fetch from network and cache it
            return fetch(event.request).then((networkResponse) => {
                // Only cache successful GET requests
                if (
                    event.request.method === 'GET' &&
                    networkResponse.status === 200
                ) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_VERSION).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return networkResponse;
            });
        })
    );
});
