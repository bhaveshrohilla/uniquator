const CACHE_NAME = 'verticon-tools-v2';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 1 day
const MAX_OFFLINE_DAYS = 14 * 24 * 60 * 60 * 1000; // 14 days
const CACHE_METADATA_KEY = 'cache-metadata';
const CACHE_EXPIRED_HTML = '/cache_expired.html';

/* FULL fallback list, fixed + normalized */
const FALLBACK_ASSETS = [
    '/',
    '/index.html',
    '/home',

    '/manifest.json',
    '/favicon.ico',

    '/src/commonstyles.css',
    '/src/commonscript.js',
    '/src/css/landing.css',
    '/src/css/tools_home.css',
    '/src/js/tools_home.js',

    '/src/images/128-128.png',
    '/src/images/512-512.png',

    '/pdf-compress',
    '/src/css/pdf-compress.css',
    '/src/js/pdf-compress.js',

    '/pdf-merge',
    '/src/css/pdf-merge.css',
    '/src/js/pdf-merge.js',

    '/pdf-rearrange',
    '/src/css/pdf-rearrange.css',
    '/src/js/pdf-rearrange.js',

    '/pdf-rotate',
    '/src/css/pdf-rotate.css',
    '/src/js/pdf-rotate.js',

    '/pdf-split',
    '/src/css/pdf-split.css',
    '/src/js/pdf-split.js',

    '/pdf-to-image',
    '/src/css/pdf-to-image.css',
    '/src/js/pdf-to-image.js',

    '/img-compress',
    '/src/css/img-compress.css',
    '/src/js/img-compress.js',

    '/img-convert',
    '/src/css/img-convert.css',
    '/src/js/img-convert.js',

    '/img-resize',
    '/src/css/img-resize.css',
    '/src/js/img-resize.js',

    '/img-to-pdf',
    '/src/css/img-to-pdf.css',
    '/src/js/img-to-pdf.js',

    '/img-exif', // FIXED (was img_exif)
    '/src/css/img-exif.css',
    '/src/js/img-exif.js',

    '/idf-platform',
    '/privacy',
    '/terms',

    CACHE_EXPIRED_HTML
];

/* ---------- IndexedDB helpers ---------- */

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('VerticonToolsDB', 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('cache-metadata')) {
                db.createObjectStore('cache-metadata');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getMetadata() {
    try {
        const db = await openDB();
        return await new Promise(res => {
            const tx = db.transaction('cache-metadata', 'readonly');
            const store = tx.objectStore('cache-metadata');
            const req = store.get(CACHE_METADATA_KEY);
            req.onsuccess = () => res(req.result || {});
            req.onerror = () => res({});
        });
    } catch {
        return {};
    }
}

async function setMetadata(data) {
    try {
        const db = await openDB();
        const tx = db.transaction('cache-metadata', 'readwrite');
        tx.objectStore('cache-metadata').put(data, CACHE_METADATA_KEY);
    } catch {}
}

function isExpired(ts) {
    return !ts || (Date.now() - ts) > CACHE_EXPIRY;
}

/* ---------- Install ---------- */

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            await Promise.allSettled(FALLBACK_ASSETS.map(a => cache.add(a)));
            const meta = {};
            const now = Date.now();
            FALLBACK_ASSETS.forEach(a => meta[new URL(a, location.origin).href] = now);
            await setMetadata(meta);
        })
    );
    self.skipWaiting();
});

/* ---------- Activate ---------- */

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
        )
    );
    self.clients.claim();
});

/* ---------- Manual refresh ---------- */

self.addEventListener('message', event => {
    if (event.data?.type === 'RECACHE_ALL') {
        event.waitUntil(
            caches.open(CACHE_NAME).then(async cache => {
                await Promise.allSettled(FALLBACK_ASSETS.map(a => cache.add(a)));
                const meta = {};
                const now = Date.now();
                FALLBACK_ASSETS.forEach(a => meta[new URL(a, location.origin).href] = now);
                await setMetadata(meta);
            })
        );
    }
});

/* ---------- Fetch ---------- */

self.addEventListener('fetch', event => {
    const req = event.request;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        const meta = await getMetadata();
        const key = req.url;
        const ts = meta[key];

        if (cached) {
            if (isExpired(ts)) {
                try {
                    const fresh = await fetch(req);
                    if (fresh && fresh.status === 200 && (fresh.type === 'basic' || fresh.type === 'cors')) {
                        cache.put(req, fresh.clone());
                        meta[key] = Date.now();
                        setMetadata(meta);
                        return fresh;
                    }
                } catch {
                    if (Date.now() - ts > MAX_OFFLINE_DAYS && req.mode === 'navigate') {
                        return cache.match(CACHE_EXPIRED_HTML);
                    }
                }
            }
            return cached;
        }

        try {
            const net = await fetch(req);
            if (net && net.status === 200 && (net.type === 'basic' || net.type === 'cors')) {
                cache.put(req, net.clone());
                meta[key] = Date.now();
                setMetadata(meta);
            }
            return net;
        } catch {
            if (req.mode === 'navigate') {
                return cache.match('/index.html');
            }
        }
    })());
});
