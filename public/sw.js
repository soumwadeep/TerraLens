/*
 * TerraLens service worker (spec §37, §40, §41).
 *
 * Goals, in order:
 *  1. The app shell must open instantly, offline, from any route.
 *  2. Static build assets are immutable → cache-first.
 *  3. Pages → network-first with a cached copy / offline fallback, so a deploy
 *     is picked up immediately when online.
 *  4. /api/* is NEVER cached — a stale API response would be a lie.
 *
 * Version bumps happen by editing SW_VERSION; the activate step evicts every
 * cache from older versions. The page controls the moment of update via
 * postMessage({ type: "SKIP_WAITING" }) after showing the user a notice.
 */

const SW_VERSION = "v2";
const CACHE_PREFIX = "terralens";
const OFFLINE_URL = "/offline";

const CACHE_SHELL = `${CACHE_PREFIX}-shell-${SW_VERSION}`;
const CACHE_PAGES = `${CACHE_PREFIX}-pages-${SW_VERSION}`;
const CACHE_ASSETS = `${CACHE_PREFIX}-assets-${SW_VERSION}`;
const CURRENT_CACHES = [CACHE_SHELL, CACHE_PAGES, CACHE_ASSETS];

// App pages ("/home" and the offline fallback) are precached separately with
// their referenced build assets — see precachePageWithAssets below. "/" is the
// public landing page and is cached at runtime on first visit like any page.
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

/**
 * Fetch a page, store its HTML, and precache the hashed build assets it
 * references (JS/CSS via regex, then fonts referenced from those CSS files).
 * Without this, an offline visit to a cached page would load unstyled HTML.
 */
async function precachePageWithAssets(shellCache, url) {
  const response = await fetch(new Request(url, { cache: "reload" }));
  if (!response.ok) throw new Error(`precache ${url}: HTTP ${response.status}`);
  const html = await response.text();
  await shellCache.put(
    url,
    new Response(html, {
      status: response.status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  );

  const assetCache = await caches.open(CACHE_ASSETS);
  const assets = new Set();
  for (const match of html.matchAll(/["'(](\/_next\/static\/[^"'()\s]+)["')]/g)) {
    assets.add(match[1]);
  }

  // Fonts are loaded from CSS via url() — parse the stylesheets one level deep.
  const cssFiles = [...assets].filter((a) => a.endsWith(".css"));
  for (const cssUrl of cssFiles) {
    try {
      const css = await (await fetch(new Request(cssUrl, { cache: "reload" }))).text();
      for (const match of css.matchAll(/url\((\/_next\/static\/[^)"']+)\)/g)) {
        assets.add(match[1]);
      }
    } catch {
      /* font discovery is best-effort */
    }
  }

  const results = await Promise.allSettled(
    [...assets].map((asset) => assetCache.add(new Request(asset, { cache: "reload" })))
  );
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.warn("[sw] asset precache failed:", [...assets][i], result.reason);
    }
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(CACHE_SHELL);
      // allSettled: one flaky fetch must not break the whole install.
      const results = await Promise.allSettled(
        PRECACHE_URLS.map((url) => shellCache.add(new Request(url, { cache: "reload" })))
      );
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          console.warn("[sw] precache failed:", PRECACHE_URLS[i], result.reason);
        }
      });

      // Offline shell pages need their referenced build assets too.
      const pages = await Promise.allSettled(
        ["/home", OFFLINE_URL].map((url) => precachePageWithAssets(shellCache, url))
      );
      pages.forEach((result) => {
        if (result.status === "rejected") {
          console.warn("[sw] page precache failed:", result.reason);
        }
      });
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.includes(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (data.type === "GET_VERSION" && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: SW_VERSION, caches: CURRENT_CACHES });
  }
});

function isCacheableResponse(response) {
  return response && response.ok && response.type === "basic";
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      const copy = response.clone();
      const cache = await caches.open(CACHE_PAGES);
      cache.put(request, copy);
    }
    return response;
  } catch {
    // Freshest runtime copy first, then any cache (the shell holds the
    // precached "/home" and offline pages).
    const pagesCache = await caches.open(CACHE_PAGES);
    const cached = (await pagesCache.match(request)) || (await caches.match(request));
    if (cached) return cached;
    const shell = await caches.open(CACHE_SHELL);
    const offline = await shell.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title><p>You are offline and this page is not cached yet. TerraLens still works from the installed app.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheableResponse(response)) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_ASSETS);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API responses must be live or fail honestly — never cached.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations and Next.js RSC payload fetches: freshness wins, with the
  // cached copy (or the offline page) as fallback.
  const isRsc = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (request.mode === "navigate" || isRsc) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Immutable build output and icons.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname === "/manifest.webmanifest" || url.pathname.startsWith("/_next/image")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (
    url.pathname === "/sw.js" ||
    url.pathname.startsWith("/workbox") ||
    url.pathname.startsWith("/_next/webpack-hmr")
  ) {
    return;
  }

  // Everything else same-origin: serve fresh when possible, else cache.
  event.respondWith(staleWhileRevalidate(request));
});
