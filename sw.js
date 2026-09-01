// PWA 서비스워커 — 같은 출처(same-origin) 정적 자산만 캐시.
// Supabase/Naver/CDN 등 다른 출처 요청은 손대지 않고 그대로 네트워크로 흘려보낸다(항상 최신 데이터 필요).
// CACHE_VERSION은 index.html의 __ASSET_V와 같은 값으로 유지 —
// tools/update-cache-buster.ps1이 두 파일을 함께 갱신한다.
const CACHE_VERSION = '20260901j';
const CACHE_NAME = `ro-risk-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  `./assets/css/base.css?v=${CACHE_VERSION}`,
  `./assets/css/dashboard.css?v=${CACHE_VERSION}`,
  `./assets/css/input.css?v=${CACHE_VERSION}`,
  `./assets/css/admin.css?v=${CACHE_VERSION}`,
  `./assets/css/ai.css?v=${CACHE_VERSION}`,
  `./assets/css/help.css?v=${CACHE_VERSION}`,
  `./assets/js-min/config.js?v=${CACHE_VERSION}`,
  `./assets/js-min/constants.js?v=${CACHE_VERSION}`,
  `./assets/js-min/state.js?v=${CACHE_VERSION}`,
  `./assets/js-min/utils.js?v=${CACHE_VERSION}`,
  `./assets/js-min/auth.js?v=${CACHE_VERSION}`,
  `./assets/js-min/nav.js?v=${CACHE_VERSION}`,
  `./assets/js-min/dashboard.js?v=${CACHE_VERSION}`,
  `./assets/js-min/input.js?v=${CACHE_VERSION}`,
  `./assets/js-min/adwatch.js?v=${CACHE_VERSION}`,
  `./assets/js-min/admin.js?v=${CACHE_VERSION}`,
  `./assets/js-min/ai.js?v=${CACHE_VERSION}`,
  `./assets/js-min/ppt.js?v=${CACHE_VERSION}`,
  `./assets/js-min/main.js?v=${CACHE_VERSION}`,
  `./assets/img/elandeats-logo.png?v=${CACHE_VERSION}`,
  './assets/img/icon-192.png',
  './assets/img/icon-512.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 다른 출처(Supabase/CDN 등)는 그대로 통과

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
