import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { appName, DEFAULT_BRAND_HEX } from "@/lib/pwa";
import { fetchTenant } from "@/lib/server/api";

/**
 * Manifest de la PWA POR TENANT (white-label): cada consultorio se instala con su
 * nombre, su color y su ícono. Arranca en el portal del paciente (`/app`); sin
 * sesión, el middleware lleva al login. En el host raíz, el de Nutreitor.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const slug = (await headers()).get("x-tenant-slug");
  const org = slug ? await fetchTenant(slug) : null;
  const name = org ? appName(org) : "Nutreitor";
  const color = org?.brandPrimaryColor ?? DEFAULT_BRAND_HEX;
  return {
    name,
    short_name: name.length > 12 ? name.split(/\s+/)[0]!.slice(0, 12) : name,
    description: org ? `Tu plan, tus turnos y tu evolución con ${name}.` : "Nutrición, en un solo lugar.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es-AR",
    background_color: "#fafaf9",
    theme_color: color,
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
