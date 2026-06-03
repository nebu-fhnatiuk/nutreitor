import { type NextRequest } from "next/server";

import { forwardAndRevalidate } from "@/lib/server/editor-proxy";
import { orgTag, proTag } from "@/lib/server/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Edita el perfil propio del profesional → invalida la org (roster) + el perfil.
 * Si el slug cambió, el cliente manda `x-prev-profile-slug` para invalidar también
 * la URL vieja (que pasa a 404). El nuevo slug sale del body de respuesta.
 */
export function PATCH(req: NextRequest) {
  return forwardAndRevalidate(req, "professional/me/profile", (slug, body, r) => {
    const tags = [orgTag(slug)];
    const newSlug = (body as { profileSlug?: string } | null)?.profileSlug;
    if (newSlug) tags.push(proTag(slug, newSlug));
    const prev = r.headers.get("x-prev-profile-slug");
    if (prev && prev !== newSlug) tags.push(proTag(slug, prev));
    return tags;
  });
}
