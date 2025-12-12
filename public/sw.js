const CACHE_NAME = 'shaleemo-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Install Event: Cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('SW: Caching App Shell');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('SW: Clearing old cache', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Network First, then Cache (for API); Cache First for static
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API calls: Network First (fresh data), Fallback to Cache
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Clone response to store in cache? 
                    // For now, simpler: just return network response.
                    // If network fails (offline), could return cached API if we optimized for that.
                    return response;
                })
                .catch(() => {
                    // Fallback: If offline, try to find in cache (if we cached dynamic data)
                    // PWA Requirements: Handling offline gracefully.
                    return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
        return;
    }

    // Static Assets: Stale-While-Revalidate or Cache First
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Return cached response immediately if found
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    // Update cache with new version
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Network failed, do nothing (we already returned cache or will return undefined)
                });

                return cachedResponse || fetchPromise;
            })
    );
});
