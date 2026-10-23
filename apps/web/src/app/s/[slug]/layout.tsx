import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import { PwaRegister } from "@/components/pwa/pwa-register";
import { appName, DEFAULT_BRAND_HEX } from "@/lib/pwa";
import { clubPalette, paletteVars } from "@nutreitor/shared";
import { fetchTenant } from "@/lib/server/api";

type Params = { params: Promise<{ slug: string }> };

/** PWA white-label: manifest e ícono del consultorio (ver app/manifest.ts). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const org = await fetchTenant((await params).slug);
  return {
    manifest: "/manifest.webmanifest",
    icons: { apple: "/pwa-icon/180" },
    appleWebApp: { capable: true, title: org ? appName(org) : undefined, statusBarStyle: "default" },
  };
}

export async function generateViewport({ params }: Params): Promise<Viewport> {
  const org = await fetchTenant((await params).slug);
  return { themeColor: org?.brandPrimaryColor ?? DEFAULT_BRAND_HEX };
}

/**
 * Layout del workspace de un tenant. Resuelve la org del slug (subdominio) y
 * aplica el branding white-label: los dos colores del club generan la paleta del
 * tema (`--brand-*`, `--accent2-*`) en runtime, sin recompilar.
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await fetchTenant(slug);
  if (!org) notFound();

  // Paleta del club (KAN-69): los dos colores + texto encima + tonos ajustados a AA.
  const style = paletteVars(clubPalette(org.brandPrimaryColor, org.brandSecondaryColor)) as CSSProperties;

  return (
    <div data-tenant={org.slug} style={style}>
      <PwaRegister />
      {children}
    </div>
  );
}
