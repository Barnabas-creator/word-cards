// 离线缓存：应用外壳用 stale-while-revalidate，词库分片用 network-first，
// 这样新生成的卡片一上线就能拿到，断网时仍有上次缓存可用。
const VERSION = "wc-v1";
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
  if (url.origin !== self.location.origin) return;   // 字体等跨域资源交给浏览器自己处理

  const isData = url.pathname.includes("/data/");

  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(e.request);
      const fetching = fetch(e.request)
        .then((res) => { if (res && res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => null);
      if (isData) return (await fetching) || cached || new Response("[]", { headers: { "content-type": "application/json" } });
      return cached || (await fetching) || new Response("离线且无缓存", { status: 503 });
    })
  );
});
