/* ═══════════════════════════════════════════════════════════════════
   SERVICE WORKER — Lyftiv v15
   Déploiement : https://oliwan13.github.io/suivi-musculation/
   ⚠️  Incrémenter CACHE_NAME à chaque déploiement pour forcer le refresh
═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'lyftiv-v20';
const BASE = '/suivi-musculation';

const FILES_TO_CACHE = [
    `${BASE}/`,
    `${BASE}/index.html`,
    `${BASE}/manifest.json`,
    `${BASE}/css/styles.css`,

    // ── JS : data (aucune dépendance) ─────────────────────────────
    `${BASE}/js/data/training-zones.js`,
    `${BASE}/js/data/training-science.js`,
    `${BASE}/js/data/default-sessions.js`,
    `${BASE}/js/data/supplement-db.js`,

    // ── JS : core ─────────────────────────────────────────────────
    `${BASE}/js/core/feature-flags.js`,
    `${BASE}/js/core/storage.js`,
    `${BASE}/js/core/render-scheduler.js`,
    `${BASE}/js/core/state.js`,

    // ── JS : fitness ──────────────────────────────────────────────
    `${BASE}/js/fitness/physio-compute.js`,
    `${BASE}/js/fitness/discipline-engine.js`,

    // ── JS : app principal ────────────────────────────────────────
    `${BASE}/js/app.js`,

    // ── JS : features ─────────────────────────────────────────────
    `${BASE}/js/features/global-nav.js`,
    `${BASE}/js/features/plan-panel.js`,
    `${BASE}/js/features/profile.js`,
    `${BASE}/js/features/onboarding.js`,
    `${BASE}/js/features/program-builder.js`,
    `${BASE}/js/features/ai-coach.js`,
    `${BASE}/js/features/fuzzy-search.js`,
    `${BASE}/js/features/supabase-sync.js`,
    `${BASE}/js/features/gamification.js`,
    `${BASE}/js/features/pro-coach.js`,
];

/* ── INSTALL : mise en cache de tous les assets ────────────────── */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(FILES_TO_CACHE))
            .then(() => self.skipWaiting()) // activer immédiatement sans attendre
    );
});

/* ── ACTIVATE : supprimer les anciens caches ────────────────────── */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('[SW] Suppression ancien cache :', key);
                        return caches.delete(key);
                    })
            ))
            .then(() => self.clients.claim()) // prendre le contrôle immédiatement
    );
});

/* ── FETCH : stratégie Cache-First avec fallback réseau ─────────── */
self.addEventListener('fetch', event => {
    // Ignorer les requêtes non-GET et les requêtes cross-origin
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse; // servi depuis le cache
                }

                // Pas en cache → fetch réseau + mise en cache dynamique
                return fetch(event.request)
                    .then(networkResponse => {
                        // Ne pas mettre en cache les erreurs
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
                            return networkResponse;
                        }

                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, responseToCache));

                        return networkResponse;
                    })
                    .catch(() => {
                        // Offline et pas en cache : renvoyer index.html (SPA fallback)
                        if (event.request.headers.get('accept')?.includes('text/html')) {
                            return caches.match(`${BASE}/index.html`);
                        }
                    });
            })
    );
});

/* ── MESSAGE : rechargement forcé depuis l'interface ───────────── */
// Déclenché par : reg.waiting.postMessage({ type: 'SKIP_WAITING' })
self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
