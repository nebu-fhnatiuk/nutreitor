import type { PlatformOrgEntry } from "@nutreitor/shared";
import { type NextRequest } from "next/server";

import { forwardPlatformDecision } from "@/lib/server/platform-proxy";
import { orgTag, proTag } from "@/lib/server/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Aprobar/rechazar/suspender: cambia si la vidriera de la org existe. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return forwardPlatformDecision(req, `platform/orgs/${id}/decision`, (body) => {
    const org = body as PlatformOrgEntry | null;
    if (!org?.slug) return [];
    return [orgTag(org.slug), ...org.licenses.map((l) => proTag(org.slug, l.profileSlug))];
  });
}
