import { type NextRequest } from "next/server";

import { forwardAndRevalidate } from "@/lib/server/editor-proxy";
import { orgTag } from "@/lib/server/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Edita el branding (nombre visible, logo, colores) → invalida el tag de la org.
 * El nombre/logo aparecen en la página pública de la org y en el título/JSON-LD de
 * cada perfil (esas páginas incluyen `orgTag` entre sus tags), así una sola
 * invalidación de `orgTag` las refresca todas (sin esperar el TTL).
 */
export function PATCH(req: NextRequest) {
  return forwardAndRevalidate(
    req,
    "organizations/current/branding",
    (slug) => [orgTag(slug)],
  );
}
