importScripts("/controller/controller.sw.js");

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  const loopbackHost = ["localhost", "127.0.0.1", "::1"].includes(self.location.hostname);
  const sameOrigin = requestUrl.origin === self.location.origin;
  const isGameRoute = requestUrl.pathname.startsWith("/games/");
  const isLocalDocument = event.request.mode === "navigate";

  // In local development, drop COEP on app documents so same-origin game frames
  // can embed normally. Public hosts use the server response policy directly.
  if (loopbackHost && sameOrigin && (isGameRoute || isLocalDocument)) {
    event.respondWith((async () => {
      const response = await fetch(event.request);
      if (!response.ok) return response;
      const headers = new Headers(response.headers);
      headers.delete("cross-origin-embedder-policy");
      if (isGameRoute) {
        headers.delete("x-frame-options");
        headers.delete("content-length");
        let policy = headers.get("content-security-policy") || "default-src 'self' https://cdn.jsdelivr.net; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self' ws: wss: https://cdn.jsdelivr.net; media-src 'self' data: blob: https://cdn.jsdelivr.net; frame-src 'self' https://cdn.jsdelivr.net; worker-src 'self' blob: https://cdn.jsdelivr.net; object-src 'none'; base-uri 'self' https://cdn.jsdelivr.net; form-action 'self'";
        policy = policy.replace(/;?\s*frame-ancestors\s+[^;]*/i, "");
        headers.set("content-security-policy", `${policy}; frame-ancestors 'self'`);
      }
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    })());
    return;
  }
  if ($scramjetController.shouldRoute(event)) event.respondWith($scramjetController.route(event));
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));