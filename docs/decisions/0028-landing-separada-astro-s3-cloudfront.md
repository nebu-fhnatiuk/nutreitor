# 0028 — Landing de producto separada: Astro estático en S3 + CloudFront

- **Estado**: aceptada
- **Fecha**: 2026-10-19

## Contexto

La landing de `nutreitor.com` vivía en la app web (`apps/web/src/app/page.tsx`). Había
quedado desactualizada y le hablaba a la nutrición en general. El producto apunta al
**sector deportivo**: nutricionistas deportivos, deportistas, clubes y gimnasios. Hay
que iterar la landing seguido (textos, SEO, páginas por público) sin acoplar cada
cambio al deploy de la app clínica.

## Decisión

- **`apps/site`**: una app propia del monorepo, en **Astro 5, 100% estática**. Usa los
  tokens de la dirección visual elegida. Desde KAN-78 (2026-10-23) es la dirección
  **"Día de partido"**: base clara con bandas oscuras y en el color del club, Barlow y
  Barlow Condensed self-hosted (`@fontsource`), la misma familia que el workspace
  (ADR 0037). El hero deja probar los colores de un club de ejemplo en vivo (un
  script chico que cambia `--brand`/`--accent2`). Antes: "Clínica luminosa", Manrope. Páginas: `/`, `/clubes`, `/gimnasios`, `/ingresar`, `404`,
  `robots.txt`, `sitemap.xml`, con JSON-LD (`SoftwareApplication` + `FAQPage`).
- **En AWS** (objetivo, sin IaC todavía): S3 (privado, Origin Access Control) +
  **CloudFront** delante de `nutreitor.com`, que decide por ruta:
  - `/registro*`, `/plataforma*`, `/api/*`, `/_next/*` y lo que pide la app → el **ALB**
    de la web (Next);
  - todo lo demás (`/`, `/clubes`, `/gimnasios`, …) → **S3**, con una CloudFront Function
    que agrega `index.html` (el build usa `build.format: "directory"`).
  - `*.nutreitor.com` (cada organización) sigue yendo directo al ALB, sin cambios.
- **Mismo dominio**: el CTA es un link relativo (`/registro`), sin CORS ni cookies entre
  dominios, y el SEO queda en el dominio raíz.
- **La web ya no tiene landing**: en prod `/` nunca le llega. En dev, si `SITE_URL` está
  configurado, la raíz de la web redirige a la landing (`:4321`).
- `/registro` y `/plataforma` (que siguen en la app) adoptan la misma estética, para que
  no se note el salto entre la landing y el alta.

## Alternativas descartadas

- **Seguir dentro de la app web**: costo cero, pero cada cambio de marketing pasa por
  el deploy de la app de datos de salud.
- **Framer/Webflow**: lo más rápido para iterar textos, pero suma otro sistema de
  diseño, pago mensual, y la marca vive fuera del repo. Se puede migrar después
  cambiando una regla de CloudFront.
- **Next.js con export estático**: posible, pero Astro genera HTML sin JS por defecto,
  que es lo que pide una landing (velocidad en el celular, SEO).

## Consecuencias

- Hay un artefacto más para publicar (`astro build` → `aws s3 sync` + invalidación de
  CloudFront) y reglas de ruteo que mantener alineadas con las rutas de la app.
- Los tokens visuales se duplican entre `apps/site` (CSS) y las páginas de la app en el
  dominio raíz (Tailwind). Si crecen, conviene un paquete de tokens compartido.
- En dev hay un servicio más en compose (`site`, :4321).
