// Offline reading (Settings → Extras): keeps the app itself on the phone so it opens with no internet. Pages are
// fetched fresh whenever there is a connection (the last good copy is used only offline); the app's built files,
// whose names change with every version, are kept once fetched. Texts downloaded for offline live in IndexedDB
// (lib/offlineStore.ts), not here.
const SHELL = 'chavrusa-shell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/static/') || /\.(woff2?|ttf|svg|png|ico|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.open(SHELL).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (req.mode === 'navigate') {
    // Only the app's own main page is kept as the offline copy (not the login page, the guide or a lab page).
    e.respondWith(fetch(req).then((r) => { if (r.ok && !r.redirected && url.pathname === '/') { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); } return r; })
      .catch(() => caches.open(SHELL).then((c) => c.match('/')).then((r) => r || new Response('Offline', { status: 503 }))));
  }
});
