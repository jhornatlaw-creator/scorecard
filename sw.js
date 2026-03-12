const CACHE = 'scorecard-v3';
const ASSETS = ['/', '/index.html', '/share.html', '/css/style.css', '/js/plays.js', '/js/storage.js', '/js/supabase.js', '/js/gameday.js', '/js/drawing.js', '/js/livefeed.js', '/js/scorecard.js', '/js/app.js'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.url.includes('statsapi.mlb.com')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/index.html'))));
});
