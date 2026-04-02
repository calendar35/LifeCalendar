const CACHE_NAME = 'calendar-user-v1.5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './supabase.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/tg.svg',
  './icons/fb.svg',
  './icons/ig.svg',
  './icons/vk.svg',
  './icons/max.svg'
];

// Установка: кэшируем статику
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // Сразу активировать новый воркер
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
  self.clients.claim(); // Сразу взять контроль над страницами
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


