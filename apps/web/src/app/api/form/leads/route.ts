import { NextResponse, type NextRequest } from "next/server";

import { clientIp } from "@/lib/server/client-ip";
import { serverEnv } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resultado que la landing muestra al volver (`/clubes?consulta=…#contacto`). */
type Outcome = "enviada" | "revisar" | "espera" | "error";

/**
 * Formulario "Hablemos para tu club" de la landing (KAN-80, ADR 0041). La landing es
 * estática (S3) y el form funciona sin JavaScript: hace un POST clásico acá, esto lo
 * pasa a JSON hacia `POST /public/leads` y vuelve a la landing con el resultado
 * (303). En prod la landing y este path comparten nutreitor.com (CloudFront manda
 * `/api/*` a la web); en dev la landing vive en `SITE_URL`.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const env = serverEnv();
  const back = (o: Outcome) =>
    NextResponse.redirect(new URL(`/clubes?consulta=${o}#contacto`, env.SITE_URL ?? req.nextUrl.origin), 303);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return back("revisar");
  }
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const body = {
    fullName: text("fullName"),
    email: text("email"),
    orgName: text("orgName"),
    orgKind: text("orgKind"),
    role: text("role"),
    athletes: text("athletes"),
    message: text("message"),
    consent: text("consent") === "on",
    website: text("website"),
  };

  const headers = new Headers({ "content-type": "application/json", "x-internal-secret": env.EDGE_SHARED_SECRET });
  const ip = clientIp(req.headers.get("x-forwarded-for"), env.TRUSTED_PROXY_HOPS);
  if (ip) headers.set("x-client-ip", ip);
  const ua = req.headers.get("user-agent");
  if (ua) headers.set("user-agent", ua);

  try {
    const r = await fetch(`${env.API_INTERNAL_URL}/public/leads`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (r.ok) return back("enviada");
    if (r.status === 429) return back("espera");
    if (r.status === 400) return back("revisar");
    return back("error");
  } catch {
    return back("error");
  }
}
