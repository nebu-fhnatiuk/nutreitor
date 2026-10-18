import type { PlatformLicenseEntry } from "@nutreitor/shared";
import { type NextRequest } from "next/server";

import { forwardPlatformDecision } from "@/lib/server/platform-proxy";
import { orgTag, proTag } from "@/lib/server/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Revisar/rechazar una matrícula: cambia si el perfil aparece en la vidriera. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await ctx.params;
  return forwardPlatformDecision(req, `platform/licenses/${profileId}/decision`, (body) => {
    const l = body as PlatformLicenseEntry | null;
    return l?.orgSlug ? [orgTag(l.orgSlug), proTag(l.orgSlug, l.profileSlug)] : [];
  });
}
