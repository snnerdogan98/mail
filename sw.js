// Uygulama dosyalarını önbelleğe alır; Gmail verilerine dokunmaz.
const VERSION = 'mail-v46';
const SHELL = ['./', 'index.html', 'style.css', 'cam.css', 'koyu.css', 'settings.js', 'autocorrect.js', 'schedule.js', 'signature.js', 'snooze.js', 'undosend.js', 'phish.js', 'access.js', 'notify.js', 'select.js', 'keys.js', 'app.js', 'cal.js', 'notes.js', 'mock.js', 'config.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'icon-maskable.png',
  'yonetici.html', 'yonetici.js', 'yonetici.webmanifest', 'yonetici-192.png', 'yonetici-512.png', 'yonetici-apple.png', 'yonetici-maskable.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Önce ağ, olmazsa önbellek: güncellemeler hemen gelir, çevrimdışıyken de açılır.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// Bildirime tıklanınca programı öne getir ve o maili aç
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const threadId = e.notification.data?.threadId;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => !/yonetici/.test(x.url)) || null;
    if (c) { c.postMessage({ type: 'open-thread', threadId }); return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
