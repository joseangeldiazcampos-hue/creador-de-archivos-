const CACHE_NAME = 'scanforge-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/ui.js',
  '/js/ocr.js',
  '/manifest.json'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Cacheando assets base');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Limpiando cache antigua');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptar peticiones
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones a la API o recursos externos excepto Puter
  if (event.request.url.includes('/api/convert')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Retornar de la caché si existe
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Si no está en caché, buscar en la red
      return fetch(event.request).then((response) => {
        // Opcional: Cachear dinámicamente recursos nuevos si se desea
        return response;
      }).catch(() => {
        // Si falla la red y no está en caché, se puede retornar una página offline genérica
        // return caches.match('/offline.html');
      });
    })
  );
});
