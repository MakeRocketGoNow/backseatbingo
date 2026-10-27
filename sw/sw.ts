/// <reference lib="webworker" />
/**
 * Service worker: caches the app shell and the built assets so a cold open
 * works with no signal (local play needs nothing else; the packs are bundled).
 *
 * Built by the `serviceWorker` plugin in vite.config.ts, which fills in the
 * two constants below from the production bundle and writes `dist/sw.js`.
 * Never used by the Vite dev server.
 */
declare const __PRECACHE__: string[];
declare const __CACHE_NAME__: string;
declare const self: ServiceWorkerGlobalScope;
// A module, so the `self` above shadows the generic worker global.
export {};

const SHELL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(__CACHE_NAME__).then((cache) => cache.addAll([SHELL, ...__PRECACHE__])),
    // No skipWaiting: the page that is open keeps the assets it was built
    // with. The client offers a reload and sends `skip-waiting` on tap.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bb-') && k !== __CACHE_NAME__).map((k) => caches.delete(k)))),
  );
});

self.addEventListener('message', (event) => {
  if ((event.data as { type?: unknown } | null)?.type === 'skip-waiting') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Rooms are live; never serve them from cache.
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(req.mode === 'navigate' ? shell(req) : cacheFirst(req));
});

/** Every route is the one page; serve the cached shell so deep links open offline too. */
async function shell(req: Request): Promise<Response> {
  const cached = await caches.match(SHELL);
  return cached ?? fetch(req);
}

/** Hashed assets never change under one name, so the cache is the source of truth. */
async function cacheFirst(req: Request): Promise<Response> {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    const cache = await caches.open(__CACHE_NAME__);
    void cache.put(req, res.clone());
  }
  return res;
}
