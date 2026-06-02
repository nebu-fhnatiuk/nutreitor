import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { fetchTenant } from "@/lib/server/api";

/**
 * Layout del workspace de un tenant. Resuelve la org del slug (subdominio) para
 * el branding white-label. Si el slug no existe → 404. (Colores/logo: placeholder
 * por ahora; cuando exista config por tenant se inyecta acá como CSS variables.)
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

  return <div data-tenant={org.slug}>{children}</div>;
}
