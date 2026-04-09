/**
 * PWA Service Worker & Install Logic
 * =================================================================
 * Extracted from blackboard.js for separation of concerns.
 * Responsibilities:
 * 1. Register and manage the service worker lifecycle.
 * 2. Handle PWA install prompts (A2HS).
 * 3. Auto-update via skipWaiting on new service worker.
 * Dependencies: blackboard-msg.js
 * =================================================================
 */

import { BBMessage } from "./blackboard-msg.js";
import { t } from './i18n.js';

let deferredPrompt;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('PWA: SW registered: ', registration);

            // 檢測是否有等待中的更新
            if (registration.waiting) {
                showUpdateToast(registration);
            }

            // 監聽新的更新發現
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateToast(registration);
                    }
                });
            });
        }).catch(err => {
            console.warn('PWA: Service Worker registration failed:', err);
        });

        // 新 SW 取得控制後靜默接管，不強制刷新頁面
        // navigator.serviceWorker.addEventListener('controllerchange', () => {
        //     window.location.reload();
        // });
    });
}

// 顯示更新提示 Toast
function showUpdateToast(registration) {
    BBMessage.info(t('pwa.updateAvailable'));
    if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
}

// 安裝提示 (A2HS)
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent("pwa:installable"));
});

// 全域安裝函式
window.installPWA = async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`PWA: User response to install prompt: ${outcome}`);
        deferredPrompt = null;
    }
};
