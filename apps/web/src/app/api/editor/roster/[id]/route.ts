import { type NextRequest } from "next/server";

import { forwardAndRevalidate } from "@/lib/server/editor-proxy";
import { orgTag } from "@/lib/server/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Curaduría del roster (admin) → invalida el tag de la org (afecta el listado). */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return forwardAndRevalidate(
    req,
    `members/${encodeURIComponent(id)}/roster`,
    (slug) => [orgTag(slug)],
  );
}
