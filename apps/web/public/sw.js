/*
 * Service worker de la PWA. A propósito NO cachea respuestas: el portal muestra
 * datos de salud y no deben quedar guardados en el dispositivo. Todo va a la red;
 * si una navegación falla por falta de conexión, se muestra un aviso.
 */
const OFFLINE_HTML = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title>
<style>body{font-family:system-ui,sans-serif;background:#fafaf9;color:#1c1917;display:flex;
min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
button{margin-top:16px;padding:10px 18px;border-radius:10px;border:1px solid #d6d3d1;background:#fff;font-size:15px}</style>
</head><body><div><h1 style="font-size:20px">Sin conexión</h1>
<p>Revisá tu conexión a internet y volvé a intentar.</p>
<button onclick="location.reload()">Reintentar</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
