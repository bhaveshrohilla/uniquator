/* =========================================
   Filenest / Verticon Service Worker
   Full precache + smart runtime cache
   ========================================= */

const CACHE_NAME = 'verticon-tools-v6';

const CACHE_EXPIRY = 24 * 60 * 60 * 1000;
const MAX_OFFLINE_DAYS = 14 * 24 * 60 * 60 * 1000;

const SLOW_NET_TIMEOUT = 2500;
const SLOW_NET_REMEMBER = 1.5 * 60 * 60 * 1000;
const SLOW_NET_RETRY_DELAY = 2 * 60 * 60 * 1000;

const DB_NAME = 'VerticonToolsDB';
const STORE = 'cache-metadata';
const META_KEY = 'state';

const CACHE_EXPIRED_HTML = 'cache_expired';

/* ===== FULL FALLBACK ASSETS (UNCHANGED) ===== */
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

  '/img-exif',
  '/src/css/img-exif.css',
  '/src/js/img-exif.js',

  '/idf-platform',
  '/privacy',
  '/terms',

  CACHE_EXPIRED_HTML
];

/* ---------- IndexedDB ---------- */

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function getMeta() {
  try {
    const db = await openDB();
    return await new Promise(res => {
      const tx = db.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const q = st.get(META_KEY);
      q.onsuccess = () => res(q.result || {});
      q.onerror = () => res({});
    });
  } catch {
    return {};
  }
}

async function setMeta(data) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, META_KEY);
  } catch {}
}

/* ---------- Helpers ---------- */

const isExpired = ts => !ts || Date.now() - ts > CACHE_EXPIRY;
const slowActive = meta => meta.slowUntil && Date.now() < meta.slowUntil;

function markSlow(meta) {
  meta.slowUntil = Date.now() + SLOW_NET_REMEMBER;
  meta.retryAt = Date.now() + SLOW_NET_RETRY_DELAY;
}

async function fetchWithTimeout(req) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SLOW_NET_TIMEOUT);
  try {
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(t);
    return res;
  } catch {
    clearTimeout(t);
    throw new Error('slow');
  }
}

/* ---------- INSTALL: CACHE EVERYTHING ---------- */

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const meta = {};
    const now = Date.now();

    await Promise.allSettled(
      FALLBACK_ASSETS.map(async a => {
        const req = new Request(a, { cache: 'reload' });
        const res = await fetch(req);
        await cache.put(req, res.clone());
        meta[new URL(a, location.origin).href] = now;
      })
    );

    await setMeta(meta);
    self.skipWaiting();
  })());
});

/* ---------- ACTIVATE ---------- */

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ---------- MANUAL REFRESH ---------- */

self.addEventListener('message', e => {
  if (e.data?.type !== 'RECACHE_ALL') return;

  e.waitUntil((async () => {
    const meta = await getMeta();
    if (!self.navigator.onLine || slowActive(meta)) {
      e.source?.postMessage({ type: 'RECACHE_ERROR' });
      return;
    }

    try {
      const cache = await caches.open(CACHE_NAME);
      const now = Date.now();

      for (const a of FALLBACK_ASSETS) {
        const req = new Request(a, { cache: 'reload' });
        const res = await fetchWithTimeout(req);
        await cache.put(req, res.clone());
        meta[new URL(a, location.origin).href] = now;
      }

      await setMeta(meta);
      e.source?.postMessage({ type: 'RECACHE_DONE' });

    } catch {
      markSlow(meta);
      await setMeta(meta);
      e.source?.postMessage({ type: 'RECACHE_ERROR' });
    }
  })());
});

/* ---------- FETCH ---------- */

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(e.request);
    const meta = await getMeta();
    const ts = meta[e.request.url];

    if (cached && slowActive(meta)) return cached;

    if (cached && isExpired(ts)) {
      try {
        const net = await fetchWithTimeout(e.request);
        await cache.put(e.request, net.clone());
        meta[e.request.url] = Date.now();
        await setMeta(meta);
        return net;
      } catch {
        markSlow(meta);
        await setMeta(meta);
        if (Date.now() - ts > MAX_OFFLINE_DAYS && e.request.mode === 'navigate') {
          return cache.match(CACHE_EXPIRED_HTML);
        }
        return cached;
      }
    }

    try {
      const net = await fetchWithTimeout(e.request);
      await cache.put(e.request, net.clone());
      meta[e.request.url] = Date.now();
      await setMeta(meta);
      return net;
    } catch {
      return cached || Response.error();
    }
  })());
});
