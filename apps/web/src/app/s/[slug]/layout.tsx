import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import { hexToRgbTriplet } from "@/lib/brand";
import { fetchTenant } from "@/lib/server/api";

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
      {children}
    </div>
  );
}
