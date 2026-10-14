// 光農報名系統的 Service Worker（PWA）：
// 1. 讓網站可以「加到主畫面」當成 App 使用
// 2. 收訊不好或離線時，仍然可以打開網站、看到「我的票券」的 QR Code
//    （票券資料本身是 tickets-view 存在手機裡的，這裡只負責讓網頁檔案在離線時也打得開）
// 3. 自己網站的檔案一律先問伺服器有沒有新版（network-first），所以更新上線後
//    重新打開就是新版，不會卡在舊版。
//
// 不攔截 Firestore／登入／EmailJS 等 API 請求，那些一律直接走網路。

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const CDN_CACHE = `cdn-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000; // 收訊很差時最多等 4 秒，就先用手機裡存的版本

const PRECACHE = [
  "./",
  "./index.html",
  "./css/style.css",
  "./manifest.webmanifest",
  "./assets/logo.webp",
  "./assets/icons/icon-192.png",
];

// 外部函式庫（Firebase SDK、Tailwind、QR Code 等）：版本固定，先用快取、背景更新
const CDN_HOSTS = ["www.gstatic.com", "cdn.tailwindcss.com", "cdn.jsdelivr.net", "unpkg.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, CDN_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

// 自己網站的檔案：先問伺服器（no-cache = 用 ETag 確認有沒有更新，沒變就很快），
// 拿到就更新快取；網路失敗或太慢就用快取，頁面本身找不到時退回首頁
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(request, { cache: "no-cache" }).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  try {
    return await withTimeout(network, NETWORK_TIMEOUT_MS);
  } catch (e) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      network.catch(() => {}); // 背景繼續抓，抓到就更新快取
      return cached;
    }
    if (request.mode === "navigate") {
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    }
    return network; // 沒有快取就只能等網路的結果（或錯誤）
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached || Response.error());
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    // gstatic 上只快取 Firebase SDK 的程式檔，其他 Google 服務照常走網路
    if (url.hostname === "www.gstatic.com" && !url.pathname.startsWith("/firebasejs/")) return;
    event.respondWith(staleWhileRevalidate(request));
  }
});
