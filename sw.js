// 缓存策略：一律「先联网，失败才用缓存」。
//
// 之前外壳走的是 cached-first，结果是新版本永远要等下一次打开才生效——
// 用户刷新了却还是旧页面，同步功能上线了却没人拿得到。
// 对这个应用来说，离线可用是底线，但「在线时拿到最新」优先级更高：
// 词库天天在长，功能也在改。
const VERSION = "wc-v10";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;   // 字体、Firestore 等跨域请求不拦

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(e.request, { cache: "no-store" });
      if (res && res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      const cached = await cache.match(e.request) || await cache.match("./index.html");
      return cached || new Response("离线且无缓存", { status: 503 });
    }
  })());
});

// 页面可以主动要求跳过等待，立刻接管
self.addEventListener("message", (e) => { if (e.data === "skip-waiting") self.skipWaiting(); });
