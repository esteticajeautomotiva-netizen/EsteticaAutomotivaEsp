const CACHE_NAME = 'je-esp-v10';
const BASE = '/EsteticaAutomotivaEsp';
const ASSETS = [
  `${BASE}/index.html`, `${BASE}/login.html`, `${BASE}/specialist.html`,
  `${BASE}/manifest.json`, `${BASE}/vars.css`, `${BASE}/admin.css`,
  `${BASE}/firebase-config.js`, `${BASE}/cloudinary.js`,
  `${BASE}/auth.js`, `${BASE}/specialist.js`,
  `${BASE}/icon-192.png`, `${BASE}/icon-512.png`
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('firestore.googleapis.com') || url.includes('identitytoolkit') ||
      url.includes('cloudinary.com') || url.includes('googleapis.com') ||
      url.includes('gstatic.com') || url.includes('onesignal.com')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r && r.status === 200 && r.type === 'basic') {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return r;
      }).catch(() => caches.match(`${BASE}/specialist.html`));
    })
  );
});

// ============================================================
// PUSH NOTIFICATION — exibe notificação quando app está fechado
// ============================================================
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data.json(); } catch(err) {
    data = { headings: { pt: '📅 Novo Agendamento!' }, contents: { pt: e.data?.text() || 'Novo agendamento recebido!' } };
  }

  const title = data.headings?.pt || data.headings?.en || '📅 Novo Agendamento!';
  const body  = data.contents?.pt  || data.contents?.en  || 'Você tem um novo agendamento.';
  const url   = data.url || 'https://esteticajeautomotiva-netizen.github.io/EsteticaAutomotivaEsp/specialist.html';

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:    '/EsteticaAutomotivaEsp/icon-192.png',
      badge:   '/EsteticaAutomotivaEsp/icon-192.png',
      vibrate: [200, 100, 200],
      data:    { url }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || 'https://esteticajeautomotiva-netizen.github.io/EsteticaAutomotivaEsp/specialist.html';
  e.waitUntil(clients.openWindow(url));
});
