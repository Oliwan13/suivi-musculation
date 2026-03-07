// sw.js — Service Worker Lyftiv v15
// Mis à jour Phase 5 du plan de refactorisation
//
// ⚠️ Retirer les deux lignes skipWaiting/claim ci-dessous AVANT mise en production.
// Elles forcent l'activation immédiate pendant le développement.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

const CACHE_NAME = 'lyftiv-v15';
const FILES_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/styles.css',
    '/js/app.js',
    '/js/core/feature-flags.js',
    '/js/core/storage.js',
    '/js/core/state.js',
    '/js/core/render-scheduler.js',
    '/js/fitness/physio-compute.js',
    '/js/fitness/discipline-engine.js',
    '/js/data/default-sessions.js',
    '/js/data/supplement-db.js',
    '/js/data/training-zones.js',
    '/js/features/global-nav.js',
    '/js/features/plan-panel.js',
    '/js/features/profile.js',
    '/js/features/onboarding.js',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        )
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});
