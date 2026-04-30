// Service worker for AI IELTS Tutor.
//
// Strategy: cache-first for the app shell (HTML, JS, CSS, fonts), network-only
// for /api/* (we never want stale auth or stale assessments). On update, the
// new SW takes over after the user closes all tabs (skipWaiting commented out
// intentionally — flushing mid-session would interrupt a writing draft).

const CACHE_NAME = 'ielts-tutor-v1';
const APP_SHELL = ['/', '/index.html', '/favicon.svg', '/apple-touch-icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined)),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
        ),
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API calls — always network. Auth, AI calls, and analytics all need fresh data.
    if (url.pathname.startsWith('/api/')) return;

    // Static assets — cache-first, fall back to network, fall back to cached index.
    event.respondWith(
        caches.match(event.request).then((hit) => {
            if (hit) return hit;
            return fetch(event.request)
                .then((resp) => {
                    if (resp.ok && event.request.method === 'GET') {
                        const clone = resp.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return resp;
                })
                .catch(() => {
                    // Offline navigation fallback.
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('', { status: 503 });
                });
        }),
    );
});
