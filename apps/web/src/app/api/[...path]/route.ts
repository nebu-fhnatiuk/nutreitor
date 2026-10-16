import { NextResponse, type NextRequest } from "next/server";

import { clientIp } from "@/lib/server/client-ip";
import { serverEnv } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy server-side hacia la API. El browser sólo habla con Next en el subdominio
 * del tenant → cookies first-party. Reenvía método, body, cookies y `x-tenant-slug`
 * (que setea el middleware desde el subdominio), y propaga `Set-Cookie` de vuelta.
 * Así el `tenant_id` nunca viaja como parámetro de cliente: el slug sale del host.
 */
async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const env = serverEnv();
  const { path } = await ctx.params;
  const target = `${env.API_INTERNAL_URL}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  // Secreto de borde: autentica al edge frente a la API.
  headers.set("x-internal-secret", env.EDGE_SHARED_SECRET);
  const slug = req.headers.get("x-tenant-slug");
  if (slug) headers.set("x-tenant-slug", slug);
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const ua = req.headers.get("user-agent");
  if (ua) headers.set("user-agent", ua);
  // IP real del cliente para el rate-limiting de la API (que sólo ve al edge).
  const ip = clientIp(req.headers.get("x-forwarded-for"), env.TRUSTED_PROXY_HOPS);
  if (ip) headers.set("x-client-ip", ip);

  const method = req.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await req.text();

  const upstream = await fetch(target, {
    method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  });

  const res = new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
  });
  const resCt = upstream.headers.get("content-type");
  if (resCt) res.headers.set("content-type", resCt);
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) res.headers.set("retry-after", retryAfter);
  // Set-Cookie puede venir múltiple (access + refresh).
  for (const c of upstream.headers.getSetCookie()) {
    res.headers.append("set-cookie", c);
  }
  return res;
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
