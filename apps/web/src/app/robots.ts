import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/** robots.txt POR TENANT (cada subdominio el suyo). El workspace queda excluido. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "localhost";
  const proto = host.includes("localhost") ? "http" : "https";
  const base = `${proto}://${host}`;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/pro", "/app", "/equipo", "/login", "/accept", "/api"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
