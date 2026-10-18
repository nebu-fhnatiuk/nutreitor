import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/server/env";

/**
 * Proxy de las decisiones de la consola de plataforma (dominio raíz, ADR 0025):
 * reenvía a la API y, si sale bien, invalida la vidriera afectada. Sin esto, una
 * org recién aprobada seguiría en 404 hasta que venza el ISR.
 */
export async function forwardPlatformDecision(
  req: NextRequest,
  apiPath: string,
  tagsFor: (body: unknown) => string[],
): Promise<NextResponse> {
  const env = serverEnv();
  const headers = new Headers();
  headers.set("x-internal-secret", env.EDGE_SHARED_SECRET);
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  headers.set("content-type", "application/json");
  // Nunca se reenvía x-tenant-slug: la consola sólo existe en el dominio raíz.

  const upstream = await fetch(`${env.API_INTERNAL_URL}/${apiPath}`, {
    method: "POST",
    headers,
    body: await req.text(),
    cache: "no-store",
  });
  const text = await upstream.text();
  if (upstream.ok) {
    try {
      for (const tag of tagsFor(text ? JSON.parse(text) : null)) revalidateTag(tag);
    } catch {
      // Sin body parseable no hay qué invalidar; el ISR vence solo.
    }
  }
  const res = new NextResponse(text, { status: upstream.status });
  const ct = upstream.headers.get("content-type");
  if (ct) res.headers.set("content-type", ct);
  return res;
}
