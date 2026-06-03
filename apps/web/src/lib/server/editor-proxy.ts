import "server-only";

import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "./env";

/**
 * Proxy de MUTACIÓN de contenido público: reenvía a la API (cookie + secreto de
 * borde + slug del host) y, si la API responde OK, invalida los tags ISR para que
 * la vidriera pública refleje el cambio al instante (en vez de esperar el TTL).
 * El slug sale del header `x-tenant-slug` (lo setea el middleware desde el host),
 * no del cliente. `tagsFor` recibe el body de respuesta para invalidar tags que
 * dependen del resultado (p. ej. el profileSlug tras un rename).
 */
type TagsFor = (slug: string, body: unknown, req: NextRequest) => string[];

export async function forwardAndRevalidate(
  req: NextRequest,
  apiPath: string,
  tagsFor: TagsFor,
): Promise<NextResponse> {
  const env = serverEnv();
  const slug = req.headers.get("x-tenant-slug");

  const headers = new Headers();
  headers.set("x-internal-secret", env.EDGE_SHARED_SECRET);
  if (slug) headers.set("x-tenant-slug", slug);
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  headers.set("content-type", "application/json");

  const upstream = await fetch(`${env.API_INTERNAL_URL}/${apiPath}`, {
    method: "PATCH",
    headers,
    body: await req.text(),
    cache: "no-store",
  });

  const text = await upstream.text();
  if (upstream.ok && slug) {
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    for (const tag of tagsFor(slug, parsed, req)) revalidateTag(tag);
  }

  const res = new NextResponse(text, { status: upstream.status });
  const ct = upstream.headers.get("content-type");
  if (ct) res.headers.set("content-type", ct);
  return res;
}
