import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import { PwaRegister } from "@/components/pwa/pwa-register";
import { hexToRgbTriplet } from "@/lib/brand";
import { appName, DEFAULT_BRAND_HEX } from "@/lib/pwa";
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
 * aplica el branding white-label: el color primario sobrescribe `--brand-rgb` en
 * runtime (las utilidades `brand` de Tailwind lo consumen), sin recompilar.
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

  const brandRgb = hexToRgbTriplet(org.brandPrimaryColor);
  const style = brandRgb ? ({ "--brand-rgb": brandRgb } as CSSProperties) : undefined;

  return (
    <div data-tenant={org.slug} style={style}>
      <PwaRegister />
      {children}
    </div>
  );
}
