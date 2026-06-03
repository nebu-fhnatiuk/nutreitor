import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { fetchPublicOrg } from "@/lib/server/public-api";

/**
 * sitemap.xml POR TENANT: resuelve el slug del subdominio (header inyectado por el
 * middleware) y lista SÓLO las URLs públicas de ese tenant (org + profesionales
 * listados). En el host raíz (sin slug) no hay sitemap de tenant.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const slug = h.get("x-tenant-slug");
  if (!slug) return [];

  const host = h.get("host") ?? "localhost";
  const proto = host.includes("localhost") ? "http" : "https";
  const base = `${proto}://${host}`;

  const org = await fetchPublicOrg(slug);
  if (!org) return [];

  const urls: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
  ];
  for (const m of org.roster) {
    urls.push({
      url: `${base}/${m.profileSlug}`,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }
  return urls;
}
