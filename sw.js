const CACHE = 'signs-app-shell-v1.3.0';
const SHELL = ['./', './index.html', './styles.css?v=1.1.0', './app.js?v=1.1.0', './model.js', './render.js', './indoor.js', './familiar-render.js', './pdf.js', './scanner.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); });
// No skipWaiting: do not replace modules in an open editing session.
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('signs-app-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok && SHELL.some(path => new URL(path, self.registration.scope).pathname === url.pathname)) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); } return response; }).catch(async () => { const cached = await caches.match(event.request); if (cached) return cached; if (event.request.mode === 'navigate') { const home = await caches.match(new URL('./index.html', self.registration.scope)); if (home) return home; } return new Response('Offline', { status: 503 }); }));
});
