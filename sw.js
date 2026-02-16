const CACHE_NAME = 'calendar-user-v1.1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './supabase.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Установка: кэшируем статику
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Активация: чистим старые кэши
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// Перехват запросов
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // 1. Игнорируем запросы к Supabase (пусть идут в сеть)
  // Это важно, чтобы контент дня обновлялся
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // 2. Для всего остального (HTML, CSS, JS) используем кэш, если есть
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );

});
