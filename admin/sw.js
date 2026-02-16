const CACHE_NAME = 'admin-panel-v1.1';
const ASSETS_TO_CACHE = [
    './index.html',
    './style.css',
    './admin.js',
    './manifest.json',
    '../supabase.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// 1. Установка: кэшируем статику (оболочку приложения)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. Активация: чистим старый кэш если обновили версию
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});

// 3. Запросы: Сначала пробуем сеть, если нет интернета — берем из кэша
self.addEventListener('fetch', (event) => {
    // Игнорируем запросы к Supabase (их кэшировать нельзя, нужны свежие данные)
    if (event.request.url.includes('supabase.co')) {
        return; 
    }

    event.respondWith(
        fetch(event.request)
            .catch(() => {
                // Если сети нет, пробуем отдать из кэша
                return caches.match(event.request);
            })
    );

});

