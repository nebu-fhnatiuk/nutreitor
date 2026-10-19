import { defineConfig } from "astro/config";

/**
 * Landing de producto (ADR 0028): sitio 100% estático. En prod se publica en S3 y lo
 * sirve CloudFront en nutreitor.com; las rutas de la app (/registro, /plataforma,
 * /api) y los subdominios de cada organización van al ALB de la app web.
 *
 * `build.format: "directory"` genera /clubes/index.html: CloudFront agrega el
 * index.html con una CloudFront Function (ver la ADR).
 */
export default defineConfig({
  site: process.env.SITE_URL ?? "https://nutreitor.com",
  output: "static",
  trailingSlash: "never",
  build: { format: "directory" },
  server: { host: true, port: 4321 },
  // Sólo dev: `site` es el hostname del servicio en la red de compose (capturas).
  vite: { server: { allowedHosts: ["localhost", "site"] } },
  devToolbar: { enabled: false },
});
