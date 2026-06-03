import { type NextRequest } from "next/server";

import { forwardAndRevalidate } from "@/lib/server/editor-proxy";
import { orgTag } from "@/lib/server/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edita la página pública de la org → invalida el tag de la org. */
export function PATCH(req: NextRequest) {
  return forwardAndRevalidate(
    req,
    "organizations/current/public-profile",
    (slug) => [orgTag(slug)],
  );
}
